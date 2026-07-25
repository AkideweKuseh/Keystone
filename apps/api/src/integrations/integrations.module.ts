import { Module } from '@nestjs/common';
import { PrismaService, UserRepository } from '@sam/persistence';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { GymSignatureGuard } from './gym-signature.guard';

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, GymSignatureGuard, UserRepository, PrismaService],
})
export class IntegrationsModule {}
