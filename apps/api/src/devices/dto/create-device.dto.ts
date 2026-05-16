import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { DeviceVendor } from '@sam/domain';

export class CreateDeviceDto {
  @ApiProperty({ example: 'HQ Lobby Reader' })
  @IsString()
  name!: string;

  @ApiProperty({ enum: DeviceVendor, default: DeviceVendor.Hikvision })
  @IsEnum(DeviceVendor)
  vendor: string = DeviceVendor.Hikvision;

  @ApiPropertyOptional({ example: 'DS-K1T343' })
  @IsString()
  @IsOptional()
  model?: string;

  @ApiProperty({ example: '10.10.0.21' })
  @IsString()
  ipAddress!: string;

  @ApiProperty({ default: 80 })
  @IsInt()
  @Min(1)
  @Max(65535)
  port: number = 80;

  @ApiProperty({ example: 'admin' })
  @IsString()
  username!: string;

  @ApiProperty()
  @IsString()
  password!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  siteId?: string;
}
