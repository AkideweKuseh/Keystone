import { Controller, Get, Param, ParseUUIDPipe, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@sam/persistence';
import { NotFoundError } from '@sam/domain';
import { RbacGuard, Roles } from '../auth/rbac.guard';
import type { JwtPayload } from '../auth/jwt.strategy';

@ApiTags('Events')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RbacGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List access events (cursor-based pagination)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'device_id', required: false })
  @ApiQuery({ name: 'user_id', required: false })
  @ApiQuery({ name: 'event_type', required: false })
  async findAll(
    @Request() req: { user: JwtPayload },
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('device_id') deviceId?: string,
    @Query('user_id') userId?: string,
    @Query('event_type') eventType?: string,
  ) {
    const take = Math.min(parseInt(limit ?? '50', 10) || 50, 100);

    const events = await this.prisma.accessEvent.findMany({
      where: {
        tenantId: req.user.tenantId,
        ...(from ? { eventTime: { gte: new Date(from) } } : {}),
        ...(to ? { eventTime: { lte: new Date(to) } } : {}),
        ...(deviceId ? { deviceId } : {}),
        ...(userId ? { userId } : {}),
        ...(eventType ? { eventType } : {}),
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { eventTime: 'desc' },
      take: take + 1,
      select: {
        id: true,
        eventType: true,
        eventSubtype: true,
        eventTime: true,
        deviceId: true,
        doorId: true,
        userId: true,
        employeeNo: true,
        receivedAt: true,
      },
    });

    const hasMore = events.length > take;
    const data = hasMore ? events.slice(0, take) : events;

    return {
      data,
      next_cursor: hasMore && data.length > 0 ? (data[data.length - 1]?.id ?? null) : null,
    };
  }

  @Get(':id')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get event by ID' })
  async findOne(@Request() req: { user: JwtPayload }, @Param('id', ParseUUIDPipe) id: string) {
    const event = await this.prisma.accessEvent.findUnique({ where: { id } });
    if (!event || event.tenantId !== req.user.tenantId) throw new NotFoundError('Event', id);
    return event;
  }
}
