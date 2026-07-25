import DigestFetch from 'digest-fetch';
import { XMLParser } from 'fast-xml-parser';
import { DriverError } from '@sam/drivers-core';
import type { DriverTarget } from '@sam/drivers-core';

interface NodeError extends Error {
  code?: string;
}

/**
 * XXE-hardened parser (no DTD / external-entity loading — fast-xml-parser's
 * safe default). Many Hikvision firmwares (e.g. DS-K1T342 series) ignore the
 * `?format=json` hint and always answer XML, so every response is parsed
 * JSON-first with an XML fallback. `<DeviceInfo>…</DeviceInfo>` parses to
 * `{ DeviceInfo: {…} }`, matching the shape the driver already expects from
 * the JSON path. See doc 13 §"JSON path first then XML fallback".
 */
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseAttributeValue: true,
  allowBooleanAttributes: true,
  ignoreDeclaration: true,
});

/** Parse a device response body as JSON, falling back to XML, then empty. */
function parseBody<T>(text: string): T {
  const trimmed = text.trim();
  if (trimmed === '') return {} as T;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return xmlParser.parse(trimmed) as T;
  }
}

export class HikvisionHttp {
  private readonly client: DigestFetch;
  private readonly base: string;
  private readonly timeoutMs: number;

  constructor(target: DriverTarget) {
    this.client = new DigestFetch(target.username, target.password);
    this.base = `http://${target.ipAddress}:${target.port}`;
    this.timeoutMs = target.timeoutMs ?? 10_000;
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T = unknown>(
    path: string,
    body: string,
    contentType = 'application/json',
  ): Promise<T> {
    return this.request<T>('POST', path, body, contentType);
  }

  async put(path: string, body: string, contentType = 'application/xml'): Promise<void> {
    await this.request<unknown>('PUT', path, body, contentType);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: string,
    contentType?: string,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);
    try {
      // digest-fetch has no types — the return is any, cast explicitly
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const rawRes = await this.client.fetch(`${this.base}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(contentType ? { 'Content-Type': contentType } : {}),
        },
        body,
        signal: controller.signal,
      });
      const res = rawRes as unknown as { status: number; text(): Promise<string> };
      if (res.status === 401 || res.status === 403) throw DriverError.authFailed();
      if (res.status === 404) throw DriverError.unsupported(path);
      if (res.status === 429) throw DriverError.rateLimited();
      if (res.status >= 500) throw DriverError.badResponse(`HTTP ${res.status}`);
      const text = await res.text();
      return parseBody<T>(text);
    } catch (err) {
      if (err instanceof DriverError) throw err;
      const e = err as NodeError;
      if (e.name === 'AbortError') throw DriverError.timeout(err);
      if (e.code === 'ECONNREFUSED' || e.code === 'EHOSTUNREACH')
        throw DriverError.unreachable(err);
      throw DriverError.internal(err);
    } finally {
      clearTimeout(timer);
    }
  }
}
