import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService, UserRepository } from '@sam/persistence';
import { QUEUE_USER_SYNC } from '@sam/queue';
import type { UserSyncJobData } from '@sam/queue';
import type { GymMemberDto } from './dto/gym-member.dto';

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const redisConnection = {
  host: redisUrl.replace('redis://', '').split(':')[0],
  port: parseInt(redisUrl.split(':')[2] ?? '6379', 10),
};

/**
 * Receives gym membership changes and translates them into device provisioning.
 * Idempotent: a re-delivery of the same member upserts the same row and bumps
 * revision, which re-enqueues (safe) sync jobs. The gym is authoritative for
 * membership state; Keystone only maps it to present/absent on devices.
 */
@Injectable()
export class IntegrationsService {
  private readonly syncQueue = new Queue<UserSyncJobData>(QUEUE_USER_SYNC, {
    connection: redisConnection,
  });

  constructor(
    private readonly users: UserRepository,
    private readonly prisma: PrismaService,
  ) {}

  async upsertMember(tenantId: string, dto: GymMemberDto) {
    const active = dto.membership.status === 'active';
    const desiredState: 'present' | 'absent' = active ? 'present' : 'absent';
    const status = active ? 'active' : 'terminated';
    const metadata = {
      source: 'gym',
      gymStatus: dto.membership.status,
      gymPlan: dto.membership.plan ?? null,
    };
    const validFrom = dto.membership.validFrom ? new Date(dto.membership.validFrom) : null;
    const validTo = dto.membership.validTo ? new Date(dto.membership.validTo) : null;

    const existing = await this.prisma.user.findUnique({
      where: { tenantId_employeeNo: { tenantId, employeeNo: dto.memberNumber } },
    });

    let userId: string;
    let revision: number;

    if (existing) {
      revision = existing.revision + 1;
      await this.users.update(existing.id, {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        validFrom,
        validTo,
        revision,
        status,
        metadata,
      });
      userId = existing.id;
    } else {
      const created = await this.users.create({
        tenant: { connect: { id: tenantId } },
        employeeNo: dto.memberNumber,
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        validFrom,
        validTo,
        status,
        metadata,
        revision: 1,
      });
      userId = created.id;
      revision = 1;
    }

    const deviceIds = await this.users.findDevicesForUser(tenantId, userId);
    await Promise.all(
      deviceIds.map(async (deviceId) => {
        await this.users.upsertSyncRow(deviceId, userId, desiredState, revision);
        await this.syncQueue.add(
          'user-sync',
          { deviceId, userId, tenantId, desiredState, revision },
          // BullMQ forbids ':' in custom ids — use '.' as separator.
          { jobId: `user-sync.${userId}.${deviceId}.${revision}` },
        );
      }),
    );

    return {
      userId,
      memberNumber: dto.memberNumber,
      status,
      desiredState,
      syncTargets: deviceIds.length,
    };
  }
}
