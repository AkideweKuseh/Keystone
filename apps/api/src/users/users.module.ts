import { Module } from '@nestjs/common';
import { PrismaService, UserRepository } from '@sam/persistence';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UserRepository, PrismaService],
})
export class UsersModule {}
