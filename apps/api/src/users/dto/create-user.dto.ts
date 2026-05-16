import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'EMP00123' })
  @IsString()
  employeeNo!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @IsISO8601()
  @IsOptional()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsISO8601()
  @IsOptional()
  validTo?: string;

  @ApiPropertyOptional({ type: [String], description: 'Access group UUIDs' })
  @IsArray()
  @IsUUID(4, { each: true })
  @IsOptional()
  accessGroupIds?: string[];
}
