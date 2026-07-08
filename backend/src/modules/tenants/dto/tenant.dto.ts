import { IsString, IsOptional, IsEnum, IsObject, MinLength } from 'class-validator';
import { TenantStatus } from '../../../entities/tenant.entity';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  slug: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional() @IsString()
  legalName?: string;

  @IsOptional() @IsString()
  taxId?: string;

  @IsOptional() @IsString()
  countryCode?: string;

  @IsOptional() @IsString()
  defaultCurrency?: string;

  @IsOptional() @IsString()
  timezone?: string;

  @IsOptional() @IsEnum(TenantStatus)
  status?: TenantStatus;

  @IsOptional() @IsObject()
  settings?: Record<string, unknown>;

  @IsOptional() @IsObject()
  integrationConfig?: Record<string, unknown>;
}

export class UpdateTenantDto {
  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsString()
  legalName?: string;

  @IsOptional() @IsString()
  taxId?: string;

  @IsOptional() @IsString()
  countryCode?: string;

  @IsOptional() @IsString()
  defaultCurrency?: string;

  @IsOptional() @IsString()
  timezone?: string;

  @IsOptional() @IsEnum(TenantStatus)
  status?: TenantStatus;

  @IsOptional() @IsObject()
  settings?: Record<string, unknown>;

  @IsOptional() @IsObject()
  integrationConfig?: Record<string, unknown>;
}
