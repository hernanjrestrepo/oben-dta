import { IsArray, IsBoolean, IsEmail, IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { SubscriptionStatus } from '../../../entities/tenant-subscription.entity';

export class CreateRoleDto {
  @IsString() @MinLength(2)
  key: string;

  @IsString() @MinLength(2)
  name: string;

  @IsOptional() @IsString()
  description?: string;

  @IsArray() @IsString({ each: true })
  permissions: string[];
}

export class UpdateRoleDto {
  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsArray() @IsString({ each: true })
  permissions?: string[];
}

export class AssignUserRoleDto {
  @IsString()
  userId: string;

  @IsString()
  roleKey: string;
}

export class UnassignUserRoleDto {
  @IsString()
  userId: string;

  @IsString()
  roleKey: string;
}

export class CreatePlatformUserRoleDto {
  @IsString()
  userId: string;

  @IsString()
  platformRoleKey: string;
}

export class CreatePlanDto {
  @IsString() @MinLength(2)
  key: string;

  @IsString() @MinLength(2)
  name: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsNumber()
  priceMonthly?: number;

  @IsOptional() @IsString()
  currency?: string;

  @IsOptional() @IsNumber()
  maxUsers?: number;

  @IsOptional() @IsNumber()
  maxStorageGb?: number;

  @IsArray() @IsString({ each: true })
  modules: string[];
}

export class UpdatePlanModulesDto {
  @IsArray() @IsString({ each: true })
  modules: string[];
}

export class AssignSubscriptionDto {
  @IsString()
  planKey: string;

  @IsOptional() @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsOptional() @IsString()
  endsAt?: string;
}

export class SetFeatureFlagDto {
  @IsString()
  moduleKey: string;

  @IsBoolean()
  enabled: boolean;

  @IsOptional() @IsString()
  reason?: string;
}

export class CreatePlatformUserDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString() @MinLength(8)
  password: string;

  @IsOptional() @IsString()
  platformRoleKey?: string;
}

export class UpdatePlatformUserDto {
  @IsOptional() @IsString()
  firstName?: string;

  @IsOptional() @IsString()
  lastName?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsString() @MinLength(8)
  password?: string;
}

export class AuditQueryDto {
  @IsOptional() @IsString()
  tenantId?: string;

  @IsOptional() @IsString()
  userId?: string;

  @IsOptional() @IsString()
  permissionKey?: string;

  @IsOptional() @IsString()
  granted?: string;

  @IsOptional() @IsString()
  from?: string;

  @IsOptional() @IsString()
  to?: string;

  @IsOptional() @IsString()
  page?: string;

  @IsOptional() @IsString()
  pageSize?: string;
}
