import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@sam/persistence';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness probe — always 200 if process is up' })
  liveness(): { status: string } {
    return { status: 'ok' };
  }

  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness probe — 200 only if DB reachable' })
  async readiness(): Promise<{ status: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
