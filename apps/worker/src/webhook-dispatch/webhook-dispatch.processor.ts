import { Queue, Worker } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@sam/persistence';
import { QUEUE_WEBHOOK_DISPATCH } from '@sam/queue';
import type { WebhookDispatchJobData } from '@sam/queue';
import { signOutbound, signingConfigured } from './webhook-signer';

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const redisHost = redisUrl.replace('redis://', '').split(':')[0] ?? 'localhost';
const redisPort = parseInt(redisUrl.split(':')[2] ?? '6379', 10);

const MAX_ATTEMPTS = 8;

let dispatchQueue: Queue<WebhookDispatchJobData> | null = null;
function queue(): Queue<WebhookDispatchJobData> {
  if (!dispatchQueue) {
    dispatchQueue = new Queue<WebhookDispatchJobData>(QUEUE_WEBHOOK_DISPATCH, {
      connection: { host: redisHost, port: redisPort },
    });
  }
  return dispatchQueue;
}

function backoffMs(attempt: number): number {
  return Math.min(5_000 * 2 ** (attempt - 1), 3_600_000);
}

function buildEventPayload(event: {
  id: string;
  tenantId: string;
  deviceId: string | null;
  doorId: string | null;
  userId: string | null;
  employeeNo: string | null;
  eventType: string;
  eventSubtype: string | null;
  eventTime: Date;
}): Prisma.JsonObject {
  return {
    eventId: event.id,
    tenantId: event.tenantId,
    eventType: event.eventType,
    eventSubtype: event.eventSubtype,
    eventTime: event.eventTime.toISOString(),
    deviceId: event.deviceId,
    doorId: event.doorId,
    userId: event.userId,
    memberNumber: event.employeeNo,
  };
}

/**
 * Called after an access event is finalized. Creates a pending WebhookDelivery
 * per active gym integration (with a webhook URL) and enqueues dispatch.
 * No-op if signing isn't configured or there are no integrations.
 */
export async function enqueueEventWebhooks(
  prisma: PrismaService,
  eventId: string,
  tenantId: string,
): Promise<void> {
  if (!signingConfigured()) return;

  const integrations = await prisma.integration.findMany({
    where: { tenantId, type: 'gym', isActive: true, webhookUrl: { not: null } },
  });
  if (integrations.length === 0) return;

  const event = await prisma.accessEvent.findUnique({ where: { id: eventId } });
  if (!event) return;
  const payload = buildEventPayload(event);

  await Promise.all(
    integrations.map(async (integration) => {
      const delivery = await prisma.webhookDelivery.create({
        data: {
          integrationId: integration.id,
          eventId,
          payload,
          status: 'pending',
          maxAttempts: MAX_ATTEMPTS,
        },
      });
      await queue().add(
        'webhook-dispatch',
        { deliveryId: delivery.id },
        {
          jobId: `webhook.${delivery.id}`,
          attempts: MAX_ATTEMPTS,
          backoff: { type: 'exponential', delay: 5_000 },
        },
      );
    }),
  );
}

export function createWebhookDispatchWorker(prisma: PrismaService): Worker<WebhookDispatchJobData> {
  return new Worker<WebhookDispatchJobData>(
    QUEUE_WEBHOOK_DISPATCH,
    async (job) => {
      const { deliveryId } = job.data;
      const delivery = await prisma.webhookDelivery.findUnique({
        where: { id: deliveryId },
        include: { integration: true },
      });
      if (!delivery) return;
      if (delivery.status === 'delivered' || delivery.status === 'dead') return;

      const url = delivery.integration?.webhookUrl;
      if (!url) {
        await prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: { status: 'dead', lastResponse: 'no webhook url', lastAttemptAt: new Date() },
        });
        return;
      }

      const body = JSON.stringify(delivery.payload);
      const { timestamp, signature, kid } = signOutbound(body);

      let status = 0;
      let respText = '';
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-length': String(Buffer.byteLength(body)),
            'x-key-id': kid,
            'x-timestamp': timestamp,
            'x-signature': signature,
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });
        status = res.status;
        respText = await res.text().catch(() => '');
      } catch (e) {
        respText = (e as Error).message ?? String(e);
      }

      const attemptNo = (job.attemptsMade ?? 0) + 1;
      const ok = status >= 200 && status < 300;
      const exhausted = attemptNo >= delivery.maxAttempts;
      const nextStatus = ok ? 'delivered' : exhausted ? 'dead' : 'pending';

      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: nextStatus,
          attempts: attemptNo,
          lastResponse: `${status || 'ERR'} ${respText}`.slice(0, 500),
          lastAttemptAt: new Date(),
          nextRetryAt: ok || exhausted ? null : new Date(Date.now() + backoffMs(attemptNo)),
        },
      });

      if (!ok) throw new Error(`webhook ${deliveryId} failed: ${status || respText}`);
    },
    { connection: { host: redisHost, port: redisPort }, concurrency: 20 },
  );
}
