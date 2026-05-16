import { Module } from '@nestjs/common';
import { PrismaService } from '@sam/persistence';
import { EventsController } from './events.controller';

@Module({
  controllers: [EventsController],
  providers: [PrismaService],
})
export class EventsModule {}
