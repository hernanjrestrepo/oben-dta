import {
  IsArray,
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

  /** Código del cliente en OBEN MAS. */
  @IsOptional()
  @IsString()
  obenCode?: string;

  /** Dominios de correo autorizados (ej. ["cliente.com"]). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  authorizedDomains?: string[];

  /** Comercial de Oben a cargo (copia de la Proforma, seguimiento de cartera). */
  @IsOptional()
  @IsEmail()
  comercialEmail?: string;

  /** Intermediario (ej. Oben US): el cliente final viene en el asunto del correo. */
  @IsOptional()
  @IsBoolean()
  finalCustomerInSubject?: boolean;
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

  /** Código del cliente en OBEN MAS. */
  @IsOptional()
  @IsString()
  obenCode?: string;

  /** Dominios de correo autorizados (ej. ["cliente.com"]). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  authorizedDomains?: string[];

  /** Comercial de Oben a cargo (copia de la Proforma, seguimiento de cartera). */
  @IsOptional()
  @IsEmail()
  comercialEmail?: string;

  /** Intermediario (ej. Oben US): el cliente final viene en el asunto del correo. */
  @IsOptional()
  @IsBoolean()
  finalCustomerInSubject?: boolean;
}
