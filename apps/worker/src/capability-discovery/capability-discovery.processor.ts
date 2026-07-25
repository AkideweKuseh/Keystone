import { Worker } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { CryptoService } from '@sam/auth';
import { DriverRegistry } from '@sam/drivers-core';
import { HikvisionDriver } from '@sam/drivers-hikvision';
import { MockDriver } from '@sam/drivers-mock';
import { PrismaService } from '@sam/persistence';
import type { CapabilityDiscoveryJobData } from '@sam/queue';
import { QUEUE_DEVICE_CAPABILITIES } from '@sam/queue';

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const redisHost = redisUrl.replace('redis://', '').split(':')[0] ?? 'localhost';
const redisPort = parseInt(redisUrl.split(':')[2] ?? '6379', 10);

export function createCapabilityDiscoveryWorker(
  prisma: PrismaService,
  crypto: CryptoService,
): Worker<CapabilityDiscoveryJobData> {
  const registry = new DriverRegistry();
  registry.register('hikvision', (t) => new HikvisionDriver(t));
  registry.register('mock', (t) => new MockDriver({ deviceInfo: { model: t.ipAddress } }));

  return new Worker<CapabilityDiscoveryJobData>(
    QUEUE_DEVICE_CAPABILITIES,
    async (job) => {
      const { deviceId, tenantId } = job.data;

      const device = await prisma.device.findUniqueOrThrow({ where: { id: deviceId } });

      const driver = registry.resolve({
        id: device.id,
        vendor: device.vendor,
        ipAddress: device.ipAddress,
        port: device.port,
        username: device.username,
        password: crypto.decrypt(Buffer.from(device.passwordEncrypted)),
      });

      // Sequential, not Promise.all: each ISAPI call is Digest auth (a 401
      // challenge + an authed retry), so parallel probes double the concurrent
      // connections on a device with a small connection limit — which starves
      // the health-check ping running at the same time and makes status flap.
      const info = await driver.getDeviceInfo();
      const caps = await driver.discoverCapabilities();

      await prisma.$transaction([
        prisma.device.update({
          where: { id: deviceId },
          data: {
            status: 'online',
            model: info.model,
            serialNumber: info.serialNumber,
            firmwareVersion: info.firmwareVersion,
            lastSeenAt: new Date(),
          },
        }),
        prisma.deviceCapability.upsert({
          where: { deviceId },
          create: {
            deviceId,
            supportsJson: caps.supportsJson,
            supportsFace: caps.supportsFace,
            supportsFp: caps.supportsFp,
            maxUsers: caps.maxUsers ?? null,
            maxCards: caps.maxCards ?? null,
            raw: caps.raw as Prisma.InputJsonValue,
          },
          update: {
            supportsJson: caps.supportsJson,
            supportsFace: caps.supportsFace,
            supportsFp: caps.supportsFp,
            maxUsers: caps.maxUsers ?? null,
            maxCards: caps.maxCards ?? null,
            raw: caps.raw as Prisma.InputJsonValue,
            discoveredAt: new Date(),
          },
        }),
      ]);

      void tenantId; // available for audit in Phase 2+
    },
    { connection: { host: redisHost, port: redisPort } },
  );
}
