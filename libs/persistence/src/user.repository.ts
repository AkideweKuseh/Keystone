import { Injectable } from '@nestjs/common';
import type { DeviceUserSync, Prisma, User, UserCredential } from '@prisma/client';
import { PrismaService } from './prisma.service';

export type UserWithRelations = User & {
  credentials: UserCredential[];
  deviceSyncs: DeviceUserSync[];
};

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async findById(id: string): Promise<UserWithRelations | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: { credentials: true, deviceSyncs: true },
    });
  }

  async findAll(tenantId: string, filter: { status?: string } = {}): Promise<User[]> {
    return this.prisma.user.findMany({
      where: { tenantId, ...(filter.status ? { status: filter.status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  async findDevicesForUser(tenantId: string, _userId: string): Promise<string[]> {
    // Returns device IDs for devices this tenant has + user is linked via access groups
    // Simplified for Phase 2: return all online/degraded devices in the tenant
    const devices = await this.prisma.device.findMany({
      where: { tenantId, status: { not: 'disabled' } },
      select: { id: true },
    });
    return devices.map((d) => d.id);
  }

  async upsertSyncRow(
    deviceId: string,
    userId: string,
    desiredState: 'present' | 'absent',
    revision: number,
  ): Promise<DeviceUserSync> {
    return this.prisma.deviceUserSync.upsert({
      where: { deviceId_userId: { deviceId, userId } },
      create: {
        deviceId,
        userId,
        desiredState,
        currentState: 'unknown',
        syncStatus: 'pending',
        revision,
      },
      update: { desiredState, syncStatus: 'pending', revision },
    });
  }

  async getSyncStatus(userId: string): Promise<DeviceUserSync[]> {
    return this.prisma.deviceUserSync.findMany({
      where: { userId },
      include: { device: { select: { id: true, name: true, ipAddress: true } } } as never,
    });
  }
}
