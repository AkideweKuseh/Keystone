import { Worker } from 'bullmq';
import { CryptoService } from '@sam/auth';
import { DriverRegistry } from '@sam/drivers-core';
import type { AccessDeviceDriver, HealthSnapshot } from '@sam/drivers-core';
import { HikvisionDriver } from '@sam/drivers-hikvision';
import { MockDriver } from '@sam/drivers-mock';
import { PrismaService } from '@sam/persistence';
import type { HealthCheckJobData } from '@sam/queue';
import { QUEUE_DEVICE_HEALTH } from '@sam/queue';

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const redisHost = redisUrl.replace('redis://', '').split(':')[0] ?? 'localhost';
const redisPort = parseInt(redisUrl.split(':')[2] ?? '6379', 10);

const STATUS_THRESHOLDS = { degradedMs: 3000 };

// Hysteresis: a real device blips occasionally (a dropped packet, a request that
// coincides with capability discovery's concurrent probes). Without tolerance a
// single failed ping flips the row to `offline` and the next success flips it
// back — visible flapping. Require several consecutive failures within one check
// before declaring offline, with a short pause between attempts.
const PING_ATTEMPTS = 3;
const PING_RETRY_DELAY_MS = 750;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Ping up to PING_ATTEMPTS times; returns the first success, or null if all fail. */
export async function pingWithRetry(driver: AccessDeviceDriver): Promise<HealthSnapshot | null> {
  for (let attempt = 1; attempt <= PING_ATTEMPTS; attempt++) {
    try {
      return await driver.ping();
    } catch {
      if (attempt < PING_ATTEMPTS) await sleep(PING_RETRY_DELAY_MS);
    }
  }
  return null;
}

/** Map a ping result to a device status. */
export function statusFromSnapshot(snap: HealthSnapshot | null): 'online' | 'degraded' | 'offline' {
  if (!snap) return 'offline';
  return snap.latencyMs > STATUS_THRESHOLDS.degradedMs ? 'degraded' : 'online';
}

export function createHealthCheckWorker(
  prisma: PrismaService,
  crypto: CryptoService,
): Worker<HealthCheckJobData> {
  const registry = new DriverRegistry();
  registry.register('hikvision', (t) => new HikvisionDriver(t));
  registry.register('mock', (t) => new MockDriver({ deviceInfo: { model: t.ipAddress } }));

  return new Worker<HealthCheckJobData>(
    QUEUE_DEVICE_HEALTH,
    async (job) => {
      const { deviceId } = job.data;

      const device = await prisma.device.findUnique({ where: { id: deviceId } });
      if (!device || device.status === 'disabled') return;

      let newStatus: string;
      try {
        const driver = registry.resolve({
          id: device.id,
          vendor: device.vendor,
          ipAddress: device.ipAddress,
          port: device.port,
          username: device.username,
          password: crypto.decrypt(Buffer.from(device.passwordEncrypted)),
        });

        const snap = await pingWithRetry(driver);
        newStatus = statusFromSnapshot(snap);
      } catch {
        // Only reached if driver resolution/decrypt throws — a genuine config
        // problem, not a transient network blip.
        newStatus = 'offline';
      }

      await prisma.device.update({
        where: { id: deviceId },
        data: {
          status: newStatus,
          lastHealthCheck: new Date(),
          lastSeenAt: newStatus !== 'offline' ? new Date() : undefined,
        },
      });
    },
    {
      connection: { host: redisHost, port: redisPort },
      concurrency: 10,
    },
  );
}
