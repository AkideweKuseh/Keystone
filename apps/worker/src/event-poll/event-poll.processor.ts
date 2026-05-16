import { Queue, Worker } from 'bullmq';
import { createHash } from 'crypto';
import { CryptoService } from '@sam/auth';
import { DriverRegistry } from '@sam/drivers-core';
import { HikvisionDriver } from '@sam/drivers-hikvision';
import { MockDriver } from '@sam/drivers-mock';
import { PrismaService } from '@sam/persistence';
import type { EventPollJobData, EventProcessJobData } from '@sam/queue';
import { QUEUE_EVENT_POLL, QUEUE_EVENT_PROCESS } from '@sam/queue';

const QUEUE_POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const redisHost = redisUrl.replace('redis://', '').split(':')[0] ?? 'localhost';
const redisPort = parseInt(redisUrl.split(':')[2] ?? '6379', 10);
const conn = { host: redisHost, port: redisPort };

export function createEventPollWorker(
  prisma: PrismaService,
  crypto: CryptoService,
): Worker<EventPollJobData> {
  const processQueue = new Queue<EventProcessJobData>(QUEUE_EVENT_PROCESS, { connection: conn });
  const pollQueue = new Queue<EventPollJobData>(QUEUE_EVENT_POLL, { connection: conn });

  // Register repeatable poll job
  void pollQueue.add(
    'init-poll',
    { deviceId: 'all', tenantId: 'all', since: new Date(0).toISOString() },
    {
      repeat: { every: QUEUE_POLL_INTERVAL_MS },
      jobId: 'event-poll-periodic',
    },
  );

  const registry = new DriverRegistry();
  registry.register('hikvision', (t) => new HikvisionDriver(t));
  registry.register('mock', (t) => new MockDriver({ deviceInfo: { model: t.ipAddress } }));

  return new Worker<EventPollJobData>(
    QUEUE_EVENT_POLL,
    async (job) => {
      // When deviceId='all', poll all pull-mode devices
      const devices = await prisma.device.findMany({
        where: { eventMode: 'pull', status: { in: ['online', 'degraded'] } },
        select: {
          id: true,
          tenantId: true,
          vendor: true,
          ipAddress: true,
          port: true,
          username: true,
          passwordEncrypted: true,
        },
      });

      const since =
        job.data.since !== new Date(0).toISOString()
          ? new Date(job.data.since)
          : new Date(Date.now() - QUEUE_POLL_INTERVAL_MS);

      for (const device of devices) {
        try {
          const driver = registry.resolve({
            id: device.id,
            vendor: device.vendor,
            ipAddress: device.ipAddress,
            port: device.port,
            username: device.username,
            password: crypto.decrypt(Buffer.from(device.passwordEncrypted)),
          });

          const events = await driver.pullEvents(since, 100);

          for (const evt of events) {
            const dedupKey = createHash('sha256')
              .update(
                `poll:${device.id}:${evt.eventTime.toISOString()}:${evt.eventType}:${evt.employeeNo ?? ''}`,
              )
              .digest('hex');

            try {
              const row = await prisma.accessEvent.create({
                data: {
                  tenantId: device.tenantId,
                  deviceId: device.id,
                  rawPayload: { source: 'pull', ...evt.raw },
                  eventTime: evt.eventTime,
                  dedupKey,
                },
                select: { id: true },
              });

              await processQueue.add(
                'process',
                { eventId: row.id, deviceId: device.id, tenantId: device.tenantId },
                { jobId: dedupKey },
              );
            } catch {
              // dedup collision — skip
            }
          }
        } catch {
          // driver failure — skip this device, health-check will handle status
        }
      }
    },
    { connection: conn, concurrency: 5 },
  );
}
