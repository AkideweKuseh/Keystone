import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { Request } from 'express';
import { Queue } from 'bullmq';
import { PrismaService } from '@sam/persistence';
import type { EventProcessJobData } from '@sam/queue';
import { QUEUE_EVENT_PROCESS } from '@sam/queue';

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const redisHost = redisUrl.replace('redis://', '').split(':')[0] ?? 'localhost';
const redisPort = parseInt(redisUrl.split(':')[2] ?? '6379', 10);

@Controller()
export class HikvisionEventsController {
  private readonly eventQueue = new Queue<EventProcessJobData>(QUEUE_EVENT_PROCESS, {
    connection: { host: redisHost, port: redisPort },
  });

  constructor(private readonly prisma: PrismaService) {}

  @Post('/hikvision/events')
  @HttpCode(200)
  async receive(
    @Query('d') deviceId: string,
    @Headers('x-device-token') token: string | undefined,
    @Headers('content-type') contentType: string,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ ok: boolean }> {
    // ── 1. Token verification (< 1 ms) ──
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { id: true, tenantId: true, pushToken: true, pushTokenExpiresAt: true },
    });

    if (!device) throw new UnauthorizedException('Unknown device');

    if (device.pushToken) {
      if (!token || token !== device.pushToken) throw new UnauthorizedException('Invalid token');
      if (device.pushTokenExpiresAt && device.pushTokenExpiresAt < new Date()) {
        throw new UnauthorizedException('Token expired');
      }
    }

    // ── 2. Build dedup key ──────────────────────────────────────────────
    const body = req.rawBody ?? Buffer.alloc(0);
    const timeBucket = Math.floor(Date.now() / 10_000); // 10-second buckets
    const dedupKey = createHash('sha256')
      .update(`${device.id}:${timeBucket}:${body.toString('hex').slice(0, 128)}`)
      .digest('hex');

    // ── 3. Persist raw event (fast INSERT) ─────────────────────────────
    let eventId: string;
    try {
      const event = await this.prisma.accessEvent.create({
        data: {
          tenantId: device.tenantId,
          deviceId: device.id,
          rawPayload: { contentType, body: body.toString('utf8') },
          dedupKey,
        },
        select: { id: true },
      });
      eventId = event.id;
    } catch {
      // Unique constraint on dedupKey = duplicate delivery — still return 200
      return { ok: true };
    }

    // ── 4. Enqueue processing (fire-and-forget) ─────────────────────────
    void this.eventQueue.add(
      'process',
      { eventId, deviceId: device.id, tenantId: device.tenantId },
      { jobId: dedupKey },
    );

    return { ok: true };
  }
}
