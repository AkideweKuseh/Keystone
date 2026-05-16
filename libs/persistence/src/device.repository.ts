import { Injectable } from '@nestjs/common';
import type { Device, DeviceCapability, Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export type DeviceWithCapabilities = Device & { capabilities: DeviceCapability | null };

@Injectable()
export class DeviceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.DeviceCreateInput): Promise<Device> {
    return this.prisma.device.create({ data });
  }

  async findById(id: string): Promise<DeviceWithCapabilities | null> {
    return this.prisma.device.findUnique({
      where: { id },
      include: { capabilities: true },
    });
  }

  async findAll(
    tenantId: string,
    filter: { status?: string; siteId?: string } = {},
  ): Promise<Device[]> {
    return this.prisma.device.findMany({
      where: {
        tenantId,
        siteId: filter.siteId,
        status: filter.status ?? { not: 'disabled' },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, data: Prisma.DeviceUpdateInput): Promise<Device> {
    return this.prisma.device.update({ where: { id }, data });
  }

  async upsertCapabilities(
    deviceId: string,
    data: Omit<Prisma.DeviceCapabilityCreateInput, 'device'>,
  ): Promise<DeviceCapability> {
    return this.prisma.deviceCapability.upsert({
      where: { deviceId },
      create: { ...data, device: { connect: { id: deviceId } } },
      update: { ...data, discoveredAt: new Date() },
    });
  }
}
