import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { NotFoundError } from '@sam/domain';
import { PrismaService, UserRepository } from '@sam/persistence';
import type { UserSyncJobData } from '@sam/queue';
import { QUEUE_USER_SYNC } from '@sam/queue';
import type { CreateUserDto } from './dto/create-user.dto';

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
export class UsersService {
  private readonly syncQueue = new Queue<UserSyncJobData>(QUEUE_USER_SYNC, {
    connection: redisConnection,
  });

  constructor(
    private readonly users: UserRepository,
    private readonly prisma: PrismaService,
  ) {}

  async create(tenantId: string, dto: CreateUserDto) {
    const user = await this.users.create({
      tenant: { connect: { id: tenantId } },
      employeeNo: dto.employeeNo,
      firstName: dto.firstName ?? null,
      lastName: dto.lastName ?? null,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
      validTo: dto.validTo ? new Date(dto.validTo) : null,
      revision: 1,
      ...(dto.accessGroupIds?.length
        ? {
            accessGroups: {
              create: dto.accessGroupIds.map((id) => ({ accessGroup: { connect: { id } } })),
            },
          }
        : {}),
    });

    const deviceIds = await this.users.findDevicesForUser(tenantId, user.id);

    await Promise.all(
      deviceIds.map(async (deviceId) => {
        await this.users.upsertSyncRow(deviceId, user.id, 'present', user.revision);
        await this.syncQueue.add(
          'user-sync',
          { deviceId, userId: user.id, tenantId, desiredState: 'present', revision: user.revision },
          { jobId: `user-sync:${user.id}:${deviceId}:${user.revision}` },
        );
      }),
    );

    return { ...user, sync_status: 'pending', sync_targets: deviceIds.length };
  }

  async findAll(tenantId: string, status?: string) {
    return this.users.findAll(tenantId, { status });
  }

  async findById(tenantId: string, id: string) {
    const user = await this.users.findById(id);
    if (!user || user.tenantId !== tenantId) throw new NotFoundError('User', id);
    return user;
  }

  async update(tenantId: string, id: string, data: Partial<CreateUserDto>) {
    const existing = await this.users.findById(id);
    if (!existing || existing.tenantId !== tenantId) throw new NotFoundError('User', id);

    const newRevision = existing.revision + 1;
    const updated = await this.users.update(id, {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      validFrom: data.validFrom ? new Date(data.validFrom) : undefined,
      validTo: data.validTo ? new Date(data.validTo) : undefined,
      revision: newRevision,
    });

    const deviceIds = await this.users.findDevicesForUser(tenantId, id);
    await Promise.all(
      deviceIds.map(async (deviceId) => {
        await this.users.upsertSyncRow(deviceId, id, 'present', newRevision);
        await this.syncQueue.add(
          'user-sync',
          { deviceId, userId: id, tenantId, desiredState: 'present', revision: newRevision },
          { jobId: `user-sync:${id}:${deviceId}:${newRevision}` },
        );
      }),
    );

    return updated;
  }

  async terminate(tenantId: string, id: string) {
    const existing = await this.users.findById(id);
    if (!existing || existing.tenantId !== tenantId) throw new NotFoundError('User', id);

    const newRevision = existing.revision + 1;
    await this.users.update(id, { status: 'terminated', revision: newRevision });

    const deviceIds = await this.users.findDevicesForUser(tenantId, id);
    await Promise.all(
      deviceIds.map(async (deviceId) => {
        await this.users.upsertSyncRow(deviceId, id, 'absent', newRevision);
        await this.syncQueue.add(
          'user-sync',
          { deviceId, userId: id, tenantId, desiredState: 'absent', revision: newRevision },
          { jobId: `user-sync:${id}:${deviceId}:${newRevision}` },
        );
      }),
    );
  }

  async getSyncStatus(tenantId: string, id: string) {
    const user = await this.users.findById(id);
    if (!user || user.tenantId !== tenantId) throw new NotFoundError('User', id);
    const syncs = await this.users.getSyncStatus(id);
    return { user_id: id, devices: syncs };
  }

  async resync(tenantId: string, id: string) {
    const user = await this.users.findById(id);
    if (!user || user.tenantId !== tenantId) throw new NotFoundError('User', id);
    if (user.status === 'terminated') {
      return this.terminate(tenantId, id);
    }
    return this.update(tenantId, id, {});
  }
}
