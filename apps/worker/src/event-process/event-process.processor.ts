import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '@sam/persistence';
import type { EventProcessJobData } from '@sam/queue';
import { QUEUE_EVENT_PROCESS } from '@sam/queue';
import { classifyEvent, parseEventPayload } from './event-parser';
import { enqueueEventWebhooks } from '../webhook-dispatch/webhook-dispatch.processor';
import { directionFromDeviceName, type GymConnector } from '../gym/gym-connector';

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const redisHost = redisUrl.replace('redis://', '').split(':')[0] ?? 'localhost';
const redisPort = parseInt(redisUrl.split(':')[2] ?? '6379', 10);

export function createEventProcessWorker(
  prisma: PrismaService,
  gym: GymConnector | null = null,
): Worker<EventProcessJobData> {
  const redisPub = new Redis({ host: redisHost, port: redisPort, lazyConnect: true });

  return new Worker<EventProcessJobData>(
    QUEUE_EVENT_PROCESS,
    async (job) => {
      const { eventId, tenantId } = job.data;

      const event = await prisma.accessEvent.findUnique({ where: { id: eventId } });
      if (!event) return;
      if (event.eventType !== 'unprocessed') return; // idempotent

      const rawPayload = event.rawPayload as { contentType?: string; body?: string };
      const parsed = parseEventPayload({
        contentType: rawPayload.contentType ?? '',
        body: rawPayload.body ?? '',
      });

      const eventType = classifyEvent(parsed);

      // Resolve user by employeeNo (best-effort — might not match)
      let userId: string | null = null;
      if (parsed.employeeNo) {
        const user = await prisma.user.findFirst({
          where: { tenantId, employeeNo: parsed.employeeNo },
          select: { id: true },
        });
        userId = user?.id ?? null;
      }

      // Resolve door by doorIndex (best-effort)
      let doorId: string | null = null;
      if (event.deviceId && parsed.doorIndex !== undefined) {
        const door = await prisma.door.findFirst({
          where: { deviceId: event.deviceId, doorIndex: parsed.doorIndex },
          select: { id: true },
        });
        doorId = door?.id ?? null;
      }

      await prisma.accessEvent.update({
        where: { id: eventId },
        data: {
          eventType,
          eventSubtype: parsed.eventSubtype ?? null,
          eventTime: parsed.eventTime ?? event.receivedAt,
          userId,
          doorId,
          employeeNo: parsed.employeeNo ?? null,
        },
      });

      // Publish to Redis for Socket.IO fan-out
      await redisPub.publish(
        `events:${tenantId}`,
        JSON.stringify({
          id: eventId,
          type: eventType,
          deviceId: event.deviceId,
          doorId,
          userId,
          employeeNo: parsed.employeeNo,
          eventTime: (parsed.eventTime ?? event.receivedAt).toISOString(),
          tenantId,
        }),
      );

      // Fan out to outbound webhooks (Keystone → gym), if configured.
      await enqueueEventWebhooks(prisma, eventId, tenantId);

      // Report attendance to BoldGym's access API, if wired. BoldGym resolves the
      // device user to a member and records it. Best-effort: the event is already
      // persisted in Keystone, so a gym-API hiccup must not fail the job. ADR 0006.
      if (gym && eventType === 'access_granted' && parsed.employeeNo) {
        try {
          const device = event.deviceId
            ? await prisma.device.findUnique({
                where: { id: event.deviceId },
                select: { name: true },
              })
            : null;
          await gym.recordScan({
            deviceUserId: parsed.employeeNo,
            deviceId: event.deviceId,
            deviceName: device?.name ?? null,
            eventTime: parsed.eventTime ?? event.receivedAt,
            direction: directionFromDeviceName(device?.name),
          });
        } catch (err) {
          process.stdout.write(
            `event-process: attendance report failed for event ${eventId}: ${(err as Error).message}\n`,
          );
        }
      }
    },
    { connection: { host: redisHost, port: redisPort }, concurrency: 30 },
  );
}
