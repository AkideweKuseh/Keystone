import { Queue, Worker } from 'bullmq';
import { PrismaService } from '@sam/persistence';
import type { UserSyncJobData } from '@sam/queue';
import { QUEUE_USER_SYNC } from '@sam/queue';

const QUEUE_GRACE_EXPIRY = 'grace-expiry';
const MS_PER_DAY = 86_400_000;

/**
 * The instant a member's access should be revoked: their membership end plus
 * the grace window. A `null` validTo means no end date — never expires.
 */
export function graceExpiryAt(validTo: Date | null, graceDays: number): number | null {
  if (!validTo) return null;
  return validTo.getTime() + graceDays * MS_PER_DAY;
}

/** True when `now` is past the member's grace window (i.e. revoke them). */
export function isPastGrace(validTo: Date | null, graceDays: number, now: number): boolean {
  const expiryAt = graceExpiryAt(validTo, graceDays);
  return expiryAt !== null && expiryAt < now;
}

/** Resolve the effective grace period: per-member override wins over tenant default. */
export function resolveGraceDays(
  metadata: Record<string, unknown> | null,
  tenantGraceDays: number | undefined,
): number {
  const override = metadata?.['gracePeriodDays'];
  return typeof override === 'number' ? override : (tenantGraceDays ?? 0);
}

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const redisHost = redisUrl.replace('redis://', '').split(':')[0] ?? 'localhost';
const redisPort = parseInt(redisUrl.split(':')[2] ?? '6379', 10);
const conn = { host: redisHost, port: redisPort };

/**
 * Periodically revokes members whose membership window has lapsed past the
 * grace period: revoke when `validTo + grace < now`.
 *
 * Grace is the tenant's `gracePeriodDays` (default 0 = revoke immediately on
 * expiry), overridable per member via `User.metadata.gracePeriodDays`.
 */
export function createGraceExpiryWorker(prisma: PrismaService): Worker {
  const syncQueue = new Queue<UserSyncJobData>(QUEUE_USER_SYNC, { connection: conn });

  // Register repeatable job (every 60s).
  void new Queue(QUEUE_GRACE_EXPIRY, { connection: conn }).add(
    'grace-expiry',
    {},
    { repeat: { every: 60_000 }, jobId: 'grace-expiry-periodic' },
  );

  return new Worker(
    QUEUE_GRACE_EXPIRY,
    async () => {
      const now = Date.now();
      const nowDate = new Date(now);

      // Candidates: active members whose validTo is already in the past.
      const candidates = await prisma.user.findMany({
        where: { status: 'active', validTo: { lt: nowDate } },
        include: { tenant: { select: { gracePeriodDays: true } } },
      });

      let revoked = 0;
      for (const u of candidates) {
        const meta = u.metadata as unknown as Record<string, unknown> | null;
        const graceDays = resolveGraceDays(meta, u.tenant?.gracePeriodDays);

        if (!isPastGrace(u.validTo, graceDays, now)) continue; // still inside the grace window

        const revision = u.revision + 1;
        await prisma.user.update({
          where: { id: u.id },
          data: { status: 'terminated', revision },
        });

        const devices = await prisma.device.findMany({
          where: { tenantId: u.tenantId, status: { not: 'disabled' } },
          select: { id: true },
        });

        await Promise.all(
          devices.map(async ({ id: deviceId }) => {
            await prisma.deviceUserSync.upsert({
              where: { deviceId_userId: { deviceId, userId: u.id } },
              create: {
                deviceId,
                userId: u.id,
                desiredState: 'absent',
                currentState: 'unknown',
                syncStatus: 'pending',
                revision,
              },
              update: { desiredState: 'absent', syncStatus: 'pending', revision },
            });
            await syncQueue.add(
              'user-sync',
              { deviceId, userId: u.id, tenantId: u.tenantId, desiredState: 'absent', revision },
              { jobId: `user-sync.${u.id}.${deviceId}.${revision}` },
            );
          }),
        );

        revoked++;
      }

      if (revoked > 0) {
        process.stdout.write(`grace-expiry: revoked ${revoked} expired member(s)\n`);
      }
    },
    { connection: conn, concurrency: 1 },
  );
}
