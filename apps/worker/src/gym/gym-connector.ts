import type { GymMember } from '@sam/domain';

/**
 * Talks to BoldGym over its access-integration HTTP API (not its database).
 * Keystone polls membership and posts attendance; BoldGym owns its own schema
 * and resolves device users to members server-side. See ADR 0006.
 */
export interface GymConnector {
  /** Members staff have linked to a device enrollment (`deviceUserId` set). */
  listLinkedMembers(): Promise<GymMember[]>;
  /** Report a door scan; BoldGym resolves the member and records attendance. */
  recordScan(scan: ScanInput): Promise<void>;
  close(): Promise<void>;
}

/** A door scan Keystone reports to BoldGym; BoldGym maps it to a ScanLog. */
export interface ScanInput {
  /** Device `employeeNo` — BoldGym resolves this to a member via `deviceUserId`. */
  deviceUserId: string;
  deviceId: string | null;
  deviceName: string | null;
  eventTime: Date;
  direction?: 'entry' | 'exit';
}

/** JSON shape of one member in `GET /api/access/members`. */
interface MemberDto {
  memberId?: string;
  subscriptionStatus?: string;
  subscriptionExpiryDate?: string | null;
  accessGym?: boolean;
  deviceUserId?: string | null;
}

/** Pure: coerce an API member object into a domain GymMember. Exported for tests. */
export function parseMemberDto(dto: MemberDto): GymMember {
  return {
    memberId: dto.memberId ?? '',
    subscriptionStatus: dto.subscriptionStatus ?? 'none',
    subscriptionExpiryDate: dto.subscriptionExpiryDate
      ? new Date(dto.subscriptionExpiryDate)
      : null,
    accessGym: dto.accessGym === true,
    deviceUserId: dto.deviceUserId ?? null,
  };
}

/** True when the gym API is configured (base URL set, no placeholder). */
export function gymConfigured(url: string | undefined): url is string {
  return !!url && !url.includes('CHANGE_ME');
}

/** Build the HTTP connector from GYM_API_URL / GYM_API_KEY, or null when unset. */
export function makeGymConnector(): GymConnector | null {
  const url = process.env['GYM_API_URL'];
  if (!gymConfigured(url)) return null;
  return new HttpGymConnector(url, process.env['GYM_API_KEY'] ?? '');
}

/**
 * Infer entry/exit from the device name (these terminals don't encode direction
 * in the payload; it's which reader fired). Pure — exported for tests.
 */
export function directionFromDeviceName(
  name: string | null | undefined,
): 'entry' | 'exit' | undefined {
  const n = (name ?? '').toLowerCase();
  if (n.includes('exit')) return 'exit';
  if (n.includes('entry') || n.includes('entrance') || n.includes('in')) return 'entry';
  return undefined;
}

const DEFAULT_TIMEOUT_MS = 8000;

export class HttpGymConnector implements GymConnector {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'X-Access-Key': this.apiKey,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...init?.headers,
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async listLinkedMembers(): Promise<GymMember[]> {
    const res = await this.request('/api/access/members');
    if (!res.ok) throw new Error(`gym members fetch failed: HTTP ${res.status}`);
    const data = (await res.json()) as { members?: MemberDto[] };
    return (data.members ?? []).map(parseMemberDto);
  }

  async recordScan(scan: ScanInput): Promise<void> {
    const res = await this.request('/api/access/attendance', {
      method: 'POST',
      body: JSON.stringify({ ...scan, eventTime: scan.eventTime.toISOString() }),
    });
    // 404 = the device user isn't linked to a member yet — expected, not an error.
    if (res.status === 404) return;
    if (!res.ok) throw new Error(`gym attendance post failed: HTTP ${res.status}`);
  }

  async close(): Promise<void> {
    // No persistent connection to close for the HTTP client.
  }
}
