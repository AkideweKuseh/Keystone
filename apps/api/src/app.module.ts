import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '@sam/persistence';
import { AuthModule } from './auth/auth.module';
import { DevicesModule } from './devices/devices.module';
import { HealthController } from './health/health.controller';
import { UsersModule } from './users/users.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, DevicesModule, UsersModule],
  controllers: [HealthController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
