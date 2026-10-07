import {
  IsString,
  IsEmail,
  MinLength,
  IsOptional,
  IsEnum,
} from 'class-validator';

export enum UserRole {
  ADMIN = 'admin',
  SALES = 'sales',
  PRODUCTION = 'production',
  FINANCE = 'finance',
}

export class RegisterDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  // tenantSlug NO se acepta: este endpoint ahora exige `users.create` y crea
  // el usuario en el tenant de quien llama (TenantContext), nunca en uno
  // elegido por el body — de lo contrario un admin de un tenant podría crear
  // usuarios dentro de OTRO tenant.
  //
  // role tampoco se acepta — un usuario nuevo nunca elige ni recibe un rol
  // aquí. Asignar rol es un paso aparte en Administración → Roles.
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  tenantSlug?: string;
}

export class PlatformLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
