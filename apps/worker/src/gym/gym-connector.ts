import { MongoClient, type Db, type Document } from 'mongodb';
import type { AttendanceRecord, GymMember } from '@sam/domain';

/**
 * Reads membership from and writes attendance to BoldGym's MongoDB. Keystone is
 * a client of that DB, not its owner — it only touches the `users` collection
 * (read) and `scanlogs` (insert). Independent of BoldGym's QR whitelist. ADR 0006.
 */
export interface GymConnector {
  /** Members that staff have linked to a device enrollment (`deviceUserId` set). */
  listLinkedMembers(): Promise<GymMember[]>;
  /** Resolve a device `employeeNo` to a BoldGym `memberId`, or null if unlinked. */
  resolveMemberByDeviceUser(deviceUserId: string): Promise<string | null>;
  /** Append a raw attendance row to `scanlogs`. */
  writeAttendance(record: AttendanceRecord): Promise<void>;
  close(): Promise<void>;
}

/** True when a real gym DB URI is configured (not blank / not the template placeholder). */
export function gymConfigured(uri: string | undefined): uri is string {
  return !!uri && !uri.includes('CHANGE_ME');
}

/** Build the Mongo connector from GYM_DATABASE_URL, or null when unconfigured. */
export function makeGymConnector(): GymConnector | null {
  const uri = process.env['GYM_DATABASE_URL'];
  if (!gymConfigured(uri)) return null;
  return new MongoGymConnector(uri);
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

/** Shape of the BoldGym `users` doc fields Keystone projects. */
interface UserDoc extends Document {
  memberId?: string;
  subscriptionStatus?: string;
  subscriptionExpiryDate?: Date | null;
  access?: { gym?: boolean; beach?: boolean };
  deviceUserId?: string | null;
}

/** Pure: map a projected BoldGym user document to a domain GymMember. Exported for tests. */
export function mapUserDoc(doc: UserDoc): GymMember {
  return {
    memberId: doc.memberId ?? '',
    subscriptionStatus: doc.subscriptionStatus ?? 'none',
    subscriptionExpiryDate: doc.subscriptionExpiryDate
      ? new Date(doc.subscriptionExpiryDate)
      : null,
    accessGym: doc.access?.gym === true,
    deviceUserId: doc.deviceUserId ?? null,
  };
}

const USER_PROJECTION = {
  memberId: 1,
  subscriptionStatus: 1,
  subscriptionExpiryDate: 1,
  'access.gym': 1,
  deviceUserId: 1,
} as const;

export class MongoGymConnector implements GymConnector {
  private readonly client: MongoClient;
  private readonly db: Db;

  constructor(uri: string) {
    this.client = new MongoClient(uri);
    // Database name comes from the URI path; MongoClient.db() with no arg uses it.
    this.db = this.client.db();
  }

  async listLinkedMembers(): Promise<GymMember[]> {
    const docs = await this.db
      .collection<UserDoc>('users')
      .find({ deviceUserId: { $nin: [null, ''] } }, { projection: USER_PROJECTION })
      .toArray();
    return docs.map(mapUserDoc);
  }

  async resolveMemberByDeviceUser(deviceUserId: string): Promise<string | null> {
    const doc = await this.db
      .collection<UserDoc>('users')
      .findOne({ deviceUserId }, { projection: { memberId: 1 } });
    return doc?.memberId ?? null;
  }

  async writeAttendance(record: AttendanceRecord): Promise<void> {
    // syncedAt marks it as written by Keystone (vs BoldGym's own QR scans).
    await this.db.collection('scanlogs').insertOne({ ...record, syncedAt: new Date() });
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
