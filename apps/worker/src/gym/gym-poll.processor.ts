import { Queue, Worker } from 'bullmq';
import { CryptoService } from '@sam/auth';
import { DriverRegistry } from '@sam/drivers-core';
import { HikvisionDriver } from '@sam/drivers-hikvision';
import { MockDriver } from '@sam/drivers-mock';
import { PrismaService } from '@sam/persistence';
import { planValidityActions, type EnrolledDeviceUser } from '@sam/domain';
import { MongoGymConnector, type GymConnector } from './gym-connector';

const QUEUE_GYM_POLL = 'gym-poll';

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const redisHost = redisUrl.replace('redis://', '').split(':')[0] ?? 'localhost';
const redisPort = parseInt(redisUrl.split(':')[2] ?? '6379', 10);
const conn = { host: redisHost, port: redisPort };

const POLL_INTERVAL_SEC = parseInt(process.env['GYM_POLL_INTERVAL_SEC'] ?? '60', 10);

/** True when a real gym DB URI is configured (not blank / not the template placeholder). */
function gymConfigured(uri: string | undefined): uri is string {
  return !!uri && !uri.includes('CHANGE_ME');
}

/**
 * Polls BoldGym membership and enforces it on the terminals: disables lapsed
 * members and re-enables renewed ones, via drift-based reconciliation (only acts
 * where the device disagrees with membership). Reads the device's enrolled set —
 * it never provisions. No-ops if GYM_DATABASE_URL isn't configured. See ADR 0006.
 *
 * `connectorOverride` is for tests; production builds the Mongo connector.
 */
export function createGymPollWorker(
  prisma: PrismaService,
  crypto: CryptoService,
  connectorOverride?: GymConnector,
): Worker | null {
  const uri = process.env['GYM_DATABASE_URL'];
  if (!connectorOverride && !gymConfigured(uri)) {
    process.stdout.write('gym-poll: GYM_DATABASE_URL not configured — poller disabled\n');
    return null;
  }
  const connector = connectorOverride ?? new MongoGymConnector(uri as string);

  const registry = new DriverRegistry();
  registry.register('hikvision', (t) => new HikvisionDriver(t));
  registry.register('mock', (t) => new MockDriver({ deviceInfo: { model: t.ipAddress } }));

  void new Queue(QUEUE_GYM_POLL, { connection: conn }).add(
    'gym-poll',
    {},
    { repeat: { every: POLL_INTERVAL_SEC * 1000 }, jobId: 'gym-poll-periodic' },
  );

  return new Worker(
    QUEUE_GYM_POLL,
    async () => {
      const now = new Date();
      const members = await connector.listLinkedMembers();
      if (members.length === 0) return;

      const devices = await prisma.device.findMany({
        where: { vendor: 'hikvision', status: { in: ['online', 'degraded'] } },
      });

      let applied = 0;
      for (const device of devices) {
        const driver = registry.resolve({
          id: device.id,
          vendor: device.vendor,
          ipAddress: device.ipAddress,
          port: device.port,
          username: device.username,
          password: crypto.decrypt(Buffer.from(device.passwordEncrypted)),
        });

        let enrolled: EnrolledDeviceUser[];
        try {
          const users = await driver.listUsers({ limit: 1000 });
          enrolled = users.map((u) => ({
            employeeNo: u.employeeNo,
            validTo: u.validTo ? new Date(u.validTo) : null,
          }));
        } catch (err) {
          process.stdout.write(
            `gym-poll: listUsers failed on device ${device.id}: ${(err as Error).message}\n`,
          );
          continue; // a device being unreachable must not block the others
        }

        for (const action of planValidityActions(enrolled, members, now)) {
          try {
            await driver.setValidity(action.employeeNo, action.enable, action.endTime);
            applied++;
          } catch (err) {
            process.stdout.write(
              `gym-poll: setValidity ${action.employeeNo} on ${device.id} failed: ${(err as Error).message}\n`,
            );
          }
        }
      }

      if (applied > 0) {
        process.stdout.write(`gym-poll: applied ${applied} validity change(s)\n`);
      }
    },
    { connection: conn, concurrency: 1 },
  );
}
