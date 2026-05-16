import { Module } from '@nestjs/common';
import { CryptoService } from '@sam/auth';
import { DeviceRepository, PrismaService } from '@sam/persistence';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  controllers: [DevicesController],
  providers: [DevicesService, DeviceRepository, CryptoService, PrismaService],
})
export class DevicesModule {}
