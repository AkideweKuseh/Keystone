import { Module } from '@nestjs/common';
import { PrismaService } from '@sam/persistence';
import { HikvisionEventsController } from './hikvision/hikvision-events.controller';

@Module({
  controllers: [HikvisionEventsController],
  providers: [PrismaService],
})
export class ReceiverModule {}
