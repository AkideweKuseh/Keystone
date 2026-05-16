import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@localhost' })
  @IsString()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;

  @ApiProperty({ required: false, description: 'MFA code (stub — not enforced in Phase 1)' })
  @IsString()
  @IsOptional()
  mfaCode?: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  refresh_token!: string;
}
