import { Queue, Worker } from 'bullmq';
import { CryptoService } from '@sam/auth';
import { DriverRegistry } from '@sam/drivers-core';
import { HikvisionDriver } from '@sam/drivers-hikvision';
import { MockDriver } from '@sam/drivers-mock';
import { PrismaService } from '@sam/persistence';
import type { UserSyncJobData } from '@sam/queue';
import { QUEUE_DEVICE_CAPABILITIES, QUEUE_USER_SYNC } from '@sam/queue';

const QUEUE_RECONCILE = 'reconcile';

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const redisHost = redisUrl.replace('redis://', '').split(':')[0] ?? 'localhost';
const redisPort = parseInt(redisUrl.split(':')[2] ?? '6379', 10);
const conn = { host: redisHost, port: redisPort };

export function createReconcilerWorker(prisma: PrismaService, _crypto: CryptoService): Worker {
  const syncQueue = new Queue<UserSyncJobData>(QUEUE_USER_SYNC, { connection: conn });
  const capQueue = new Queue(QUEUE_DEVICE_CAPABILITIES, { connection: conn });

  // Register repeatable reconcile job (every 5 min)
  void new Queue(QUEUE_RECONCILE, { connection: conn }).add(
    'reconcile',
    {},
    { repeat: { every: 5 * 60 * 1000 }, jobId: 'reconcile-periodic' },
  );

  const registry = new DriverRegistry();
  registry.register('hikvision', (t) => new HikvisionDriver(t));
  registry.register('mock', (t) => new MockDriver({ deviceInfo: { model: t.ipAddress } }));

  return new Worker(
    QUEUE_RECONCILE,
    async () => {
      const devices = await prisma.device.findMany({
        where: { status: { in: ['online', 'degraded'] } },
        select: { id: true, tenantId: true },
      });

      for (const device of devices) {
        // Find all device_user_sync rows that are pending/failed — re-enqueue
        const pendingRows = await prisma.deviceUserSync.findMany({
          where: { deviceId: device.id, syncStatus: { in: ['pending', 'failed'] } },
        });

        for (const row of pendingRows) {
          await syncQueue.add(
            'user-sync',
            {
              deviceId: device.id,
              userId: row.userId,
              tenantId: device.tenantId,
              desiredState: row.desiredState as 'present' | 'absent',
              revision: row.revision,
            },
            { jobId: `user-sync:${row.userId}:${device.id}:${row.revision}` },
          );
        }

        // Also re-trigger capability discovery if never discovered
        const caps = await prisma.deviceCapability.findUnique({ where: { deviceId: device.id } });
        if (!caps) {
          await capQueue.add('discover', { deviceId: device.id, tenantId: device.tenantId });
        }
      }

      void syncQueue;
      void capQueue;
    },
    { connection: conn, concurrency: 2 },
  );
}
