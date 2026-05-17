import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SyncService } from './sync.service';

@Controller('sync')
@UseGuards(AuthGuard('jwt'))
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('status')
  status() {
    return this.sync.getQueueStatus();
  }

  @Get('failures')
  failures() {
    return this.sync.getFailures();
  }

  @Post('run')
  run() {
    return this.sync.triggerReconcile();
  }
}
