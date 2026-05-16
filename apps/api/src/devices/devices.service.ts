import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { CryptoService } from '@sam/auth';
import { NotFoundError } from '@sam/domain';
import { DeviceRepository } from '@sam/persistence';
import { QUEUE_DEVICE_CAPABILITIES, QUEUE_DEVICE_HEALTH } from '@sam/queue';
import type { CapabilityDiscoveryJobData, HealthCheckJobData } from '@sam/queue';
import type { CreateDeviceDto } from './dto/create-device.dto';
import type { UpdateDeviceDto } from './dto/update-device.dto';

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
export class DevicesService {
  private readonly capabilityQueue = new Queue<CapabilityDiscoveryJobData>(
    QUEUE_DEVICE_CAPABILITIES,
    {
      connection: redisConnection,
    },
  );
  private readonly healthQueue = new Queue<HealthCheckJobData>(QUEUE_DEVICE_HEALTH, {
    connection: redisConnection,
  });

  constructor(
    private readonly repo: DeviceRepository,
    private readonly crypto: CryptoService,
  ) {}

  async create(tenantId: string, dto: CreateDeviceDto) {
    const passwordEncrypted = this.crypto.encrypt(dto.password);

    const device = await this.repo.create({
      tenant: { connect: { id: tenantId } },
      name: dto.name,
      vendor: dto.vendor,
      model: dto.model ?? null,
      ipAddress: dto.ipAddress,
      port: dto.port,
      username: dto.username,
      passwordEncrypted,
      ...(dto.siteId ? { site: { connect: { id: dto.siteId } } } : {}),
    });

    await Promise.all([
      this.capabilityQueue.add('discover', { deviceId: device.id, tenantId }),
      this.healthQueue.add(
        'health-check',
        { deviceId: device.id, tenantId },
        { repeat: { every: 60_000 }, jobId: `health:${device.id}` },
      ),
    ]);

    return this.sanitize(device);
  }

  async findAll(tenantId: string, filter: { status?: string; siteId?: string } = {}) {
    const devices = await this.repo.findAll(tenantId, filter);
    return devices.map((d) => this.sanitize(d));
  }

  async findById(tenantId: string, id: string) {
    const device = await this.repo.findById(id);
    if (!device || device.tenantId !== tenantId) throw new NotFoundError('Device', id);
    return { ...this.sanitize(device), capabilities: device.capabilities };
  }

  async update(tenantId: string, id: string, dto: UpdateDeviceDto) {
    const existing = await this.repo.findById(id);
    if (!existing || existing.tenantId !== tenantId) throw new NotFoundError('Device', id);

    const updateData: Record<string, unknown> = { ...dto };
    if (dto.password) {
      updateData['passwordEncrypted'] = this.crypto.encrypt(dto.password);
      delete updateData['password'];
    }

    const updated = await this.repo.update(id, updateData);
    return this.sanitize(updated);
  }

  async softDelete(tenantId: string, id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing || existing.tenantId !== tenantId) throw new NotFoundError('Device', id);
    await this.repo.update(id, { status: 'disabled' });
  }

  // Strip password bytes — NEVER return them
  private sanitize<T extends { passwordEncrypted: Buffer | Uint8Array }>(
    device: T,
  ): Omit<T, 'passwordEncrypted'> {
    const { passwordEncrypted: _pw, ...safe } = device;
    void _pw;
    return safe;
  }
}
