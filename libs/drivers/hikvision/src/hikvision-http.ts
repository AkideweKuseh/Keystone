import DigestFetch from 'digest-fetch';
import { DriverError } from '@sam/drivers-core';
import type { DriverTarget } from '@sam/drivers-core';

interface NodeError extends Error {
  code?: string;
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
      return JSON.parse(text) as T;
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
