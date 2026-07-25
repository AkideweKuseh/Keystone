import 'reflect-metadata';
import { CryptoService } from '@sam/auth';
import { PrismaService } from '@sam/persistence';
import { loadEnvFile } from './env';
import { createCapabilityDiscoveryWorker } from './capability-discovery/capability-discovery.processor';
import { createEventPollWorker } from './event-poll/event-poll.processor';
import { createEventProcessWorker } from './event-process/event-process.processor';
import { createHealthCheckWorker } from './health-check/health-check.processor';
import { createReconcilerWorker } from './reconciler/reconciler.processor';
import { createUserSyncWorker } from './user-sync/user-sync.processor';
import { createWebhookDispatchWorker } from './webhook-dispatch/webhook-dispatch.processor';

async function bootstrap(): Promise<void> {
  loadEnvFile();

  const prisma = new PrismaService();
  await prisma.onModuleInit();

  const crypto = new CryptoService();

  const workers = [
    createCapabilityDiscoveryWorker(prisma, crypto),
    createHealthCheckWorker(prisma, crypto),
    createUserSyncWorker(prisma, crypto),
    createReconcilerWorker(prisma, crypto),
    createEventProcessWorker(prisma),
    createEventPollWorker(prisma, crypto),
    createWebhookDispatchWorker(prisma),
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
