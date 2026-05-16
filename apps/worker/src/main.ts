import 'reflect-metadata';
import { CryptoService } from '@sam/auth';
import { PrismaService } from '@sam/persistence';
import { createCapabilityDiscoveryWorker } from './capability-discovery/capability-discovery.processor';
import { createHealthCheckWorker } from './health-check/health-check.processor';

async function bootstrap(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.onModuleInit();

  const crypto = new CryptoService();

  const capabilityWorker = createCapabilityDiscoveryWorker(prisma, crypto);
  const healthWorker = createHealthCheckWorker(prisma, crypto);

  process.stdout.write('Workers started: capability-discovery, health-check\n');

  const shutdown = async (): Promise<void> => {
    await Promise.all([capabilityWorker.close(), healthWorker.close(), prisma.onModuleDestroy()]);
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown();
  });
  process.on('SIGINT', () => {
    void shutdown();
  });
}

void bootstrap();
