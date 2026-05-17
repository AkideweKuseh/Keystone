import { Module } from '@nestjs/common';
import { PrismaService } from '@sam/persistence';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  controllers: [SyncController],
  providers: [SyncService, PrismaService],
})
export class SyncModule {}
