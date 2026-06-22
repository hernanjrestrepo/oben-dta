import {
  IsString,
  IsEmail,
  IsOptional,
  IsNumber,
  IsPositive,
  IsBoolean,
  MinLength,
} from 'class-validator';

export class CreateClientDto {
  @IsString()
  @MinLength(2)
  clientId: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  creditLimit?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  creditLimit?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
