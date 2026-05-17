import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '@sam/persistence';
import { QUEUE_USER_SYNC, QUEUE_DEVICE_HEALTH, QUEUE_EVENT_PROCESS } from '@sam/queue';

const redisConnection = {
  host: (process.env['REDIS_URL'] ?? 'redis://localhost:6379')
    .replace('redis://', '')
    .split(':')[0],
  port: parseInt(
    (process.env['REDIS_URL'] ?? 'redis://localhost:6379').split(':')[2] ?? '6379',
    10,
  ),
};

@Injectable()
export class SyncService {
  private readonly queues = [
    new Queue(QUEUE_USER_SYNC, { connection: redisConnection }),
    new Queue(QUEUE_DEVICE_HEALTH, { connection: redisConnection }),
    new Queue(QUEUE_EVENT_PROCESS, { connection: redisConnection }),
  ];

  constructor(private readonly prisma: PrismaService) {}

  async getQueueStatus() {
    const queues = await Promise.all(
      this.queues.map(async (q) => ({
        name: q.name,
        waiting: await q.getWaitingCount(),
        active: await q.getActiveCount(),
        failed: await q.getFailedCount(),
      })),
    );
    return { queues };
  }

  async getFailures() {
    const rows = await this.prisma.deviceUserSync.findMany({
      where: { syncStatus: 'failed' },
      include: {
        device: { select: { name: true } },
        user: { select: { employeeNo: true, firstName: true, lastName: true } },
      },
      orderBy: { lastAttemptAt: 'desc' },
      take: 100,
    });
    return { data: rows };
  }

  async triggerReconcile() {
    const devices = await this.prisma.device.findMany({
      where: { status: { in: ['online', 'degraded'] } },
      select: { id: true, tenantId: true },
    });

    const userSyncQueue = this.queues[0];
    const jobs = await Promise.all(
      devices.map((d) =>
        userSyncQueue.add(
          'reconcile',
          { deviceId: d.id, tenantId: d.tenantId },
          { jobId: `reconcile-${d.id}-${Date.now()}` },
        ),
      ),
    );

    return { enqueued: jobs.length };
  }
}
