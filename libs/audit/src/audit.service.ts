import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@sam/persistence';

export interface AuditEntry {
  tenantId: string;
  actorId?: string;
  actorKind: 'admin' | 'system' | 'api_key';
  action: string;
  resource: string;
  payload?: Record<string, unknown>;
  result: 'success' | 'failure' | 'pending';
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async write(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorId: entry.actorId ?? null,
        actorKind: entry.actorKind,
        action: entry.action,
        resource: entry.resource,
        payload: (entry.payload ?? {}) as Prisma.InputJsonValue,
        result: entry.result,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  }
}
