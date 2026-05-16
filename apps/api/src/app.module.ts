import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '@sam/persistence';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule],
  controllers: [HealthController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
