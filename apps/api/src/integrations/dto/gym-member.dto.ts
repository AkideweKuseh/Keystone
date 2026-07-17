import { IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export type GymMembershipStatus = 'active' | 'suspended' | 'expired' | 'cancelled';

/**
 * Membership state as known by the gym (the source of truth for billing).
 * Keystone maps this to device provisioning: `active` → present, others → absent.
 */
export class GymMembershipDto {
  @IsEnum(['active', 'suspended', 'expired', 'cancelled'])
  status!: GymMembershipStatus;

  /** ISO 8601. Start of the subscription window. */
  @IsOptional()
  @IsString()
  validFrom?: string;

  /** ISO 8601. End of the subscription window. Grace is applied by Keystone. */
  @IsOptional()
  @IsString()
  validTo?: string;

  /** Gym plan name, kept in metadata for traceability. */
  @IsOptional()
  @IsString()
  plan?: string;
}

/**
 * Idempotent payload pushed by the gym when a member is created/updated.
 * Biometrics are NOT included — devices capture face + fingerprint; Keystone
 * harvests and replicates them across the fleet (see docs 05/13).
 */
export class GymMemberDto {
  /** Gym member number — maps to Keystone `employeeNo`. */
  @IsString()
  memberNumber!: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @ValidateNested()
  @Type(() => GymMembershipDto)
  membership!: GymMembershipDto;
}
