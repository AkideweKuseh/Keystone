import { Worker } from 'bullmq';
import { CryptoService } from '@sam/auth';
import { DriverRegistry } from '@sam/drivers-core';
import { HikvisionDriver } from '@sam/drivers-hikvision';
import { MockDriver } from '@sam/drivers-mock';
import { PrismaService } from '@sam/persistence';
import type { HealthCheckJobData } from '@sam/queue';
import { QUEUE_DEVICE_HEALTH } from '@sam/queue';

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const redisHost = redisUrl.replace('redis://', '').split(':')[0] ?? 'localhost';
const redisPort = parseInt(redisUrl.split(':')[2] ?? '6379', 10);

const STATUS_THRESHOLDS = { degradedMs: 3000 };

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

        const snap = await driver.ping();
        newStatus = snap.latencyMs > STATUS_THRESHOLDS.degradedMs ? 'degraded' : 'online';
      } catch {
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
