import 'reflect-metadata';
import { CryptoService } from '@sam/auth';
import { PrismaService } from '@sam/persistence';
import { createCapabilityDiscoveryWorker } from './capability-discovery/capability-discovery.processor';
import { createHealthCheckWorker } from './health-check/health-check.processor';
import { createReconcilerWorker } from './reconciler/reconciler.processor';
import { createUserSyncWorker } from './user-sync/user-sync.processor';

async function bootstrap(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.onModuleInit();

  const crypto = new CryptoService();

  const workers = [
    createCapabilityDiscoveryWorker(prisma, crypto),
    createHealthCheckWorker(prisma, crypto),
    createUserSyncWorker(prisma, crypto),
    createReconcilerWorker(prisma, crypto),
  ];

  process.stdout.write(`Workers started: ${workers.length} queues active\n`);

  const shutdown = async (): Promise<void> => {
    await Promise.all([...workers.map((w) => w.close()), prisma.onModuleDestroy()]);
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
