import { Worker, type Job } from 'bullmq';
import { CryptoService } from '@sam/auth';
import { DriverError, DriverRegistry } from '@sam/drivers-core';
import { HikvisionDriver } from '@sam/drivers-hikvision';
import { MockDriver } from '@sam/drivers-mock';
import { PrismaService } from '@sam/persistence';
import type { UserSyncJobData } from '@sam/queue';
import { QUEUE_USER_SYNC } from '@sam/queue';

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const redisHost = redisUrl.replace('redis://', '').split(':')[0] ?? 'localhost';
const redisPort = parseInt(redisUrl.split(':')[2] ?? '6379', 10);

export function createUserSyncWorker(
  prisma: PrismaService,
  crypto: CryptoService,
): Worker<UserSyncJobData> {
  const registry = new DriverRegistry();
  registry.register('hikvision', (t) => new HikvisionDriver(t));
  registry.register('mock', (t) => new MockDriver({ deviceInfo: { model: t.ipAddress } }));

  return new Worker<UserSyncJobData>(
    QUEUE_USER_SYNC,
    async (job: Job<UserSyncJobData>) => {
      const { deviceId, userId, desiredState, revision } = job.data;

      // ── 1. Revision guard — skip if a newer job already processed this ──
      const syncRow = await prisma.deviceUserSync.findUnique({
        where: { deviceId_userId: { deviceId, userId } },
      });
      if (syncRow && syncRow.revision > revision) {
        return 'stale';
      }

      // ── 2. Transition to in_progress inside a transaction ─────────────
      await prisma.deviceUserSync.update({
        where: { deviceId_userId: { deviceId, userId } },
        data: {
          syncStatus: 'in_progress',
          lastAttemptAt: new Date(),
          retryCount: { increment: 1 },
        },
      });

      const device = await prisma.device.findUniqueOrThrow({ where: { id: deviceId } });
      const driver = registry.resolve({
        id: device.id,
        vendor: device.vendor,
        ipAddress: device.ipAddress,
        port: device.port,
        username: device.username,
        password: crypto.decrypt(Buffer.from(device.passwordEncrypted)),
      });

      try {
        if (desiredState === 'present') {
          const user = await prisma.user.findUniqueOrThrow({
            where: { id: userId },
            include: { credentials: { where: { isActive: true, type: 'card' } } },
          });

          await driver.upsertUser({
            employeeNo: user.employeeNo,
            firstName: user.firstName ?? '',
            lastName: user.lastName ?? '',
            validFrom: user.validFrom?.toISOString(),
            validTo: user.validTo?.toISOString(),
            doorIndexes: [1],
          });

          for (const cred of user.credentials) {
            if (cred.cardNumber) {
              await driver.upsertCard(user.employeeNo, { cardNumber: cred.cardNumber });
            }
          }
        } else {
          // Revoke = disable, never delete: the face/card is enrolled on the
          // device and must survive so a renewal needs no re-enrollment (ADR 0006).
          const user = await prisma.user.findUnique({ where: { id: userId } });
          if (user) await driver.setValidity(user.employeeNo, false);
        }

        // ── 3. Mark synced ────────────────────────────────────────────────
        await prisma.deviceUserSync.update({
          where: { deviceId_userId: { deviceId, userId } },
          data: {
            syncStatus: 'synced',
            currentState: desiredState,
            lastSyncedAt: new Date(),
            errorMessage: null,
            revision,
          },
        });
      } catch (err) {
        const isRetryable = err instanceof DriverError ? err.isRetryable : true;
        const errMsg = err instanceof Error ? err.message : String(err);

        await prisma.deviceUserSync.update({
          where: { deviceId_userId: { deviceId, userId } },
          data: {
            syncStatus: isRetryable ? 'pending' : 'failed',
            errorMessage: errMsg,
          },
        });

        if (!isRetryable) {
          // AuthFailed/UnsupportedFeature — mark device degraded, don't retry
          if (err instanceof DriverError && (err.code as string) === 'DRIVER_AUTH_FAILED') {
            await prisma.device.update({ where: { id: deviceId }, data: { status: 'degraded' } });
          }
          return 'permanent-failure';
        }

        throw err; // BullMQ handles retry with backoff
      }
    },
    {
      connection: { host: redisHost, port: redisPort },
      concurrency: 20,
    },
  );
}
