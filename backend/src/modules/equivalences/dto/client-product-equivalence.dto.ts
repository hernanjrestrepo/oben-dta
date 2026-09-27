import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

/** Un código hecho solo de espacios no es un código (se guarda sin espacios sobrantes). */
const NOT_BLANK = /\S/;

export class CreateEquivalenceDto {
  @IsUUID()
  clientId: string;

  @IsString()
  @Matches(NOT_BLANK, { message: 'no puede estar vacío' })
  clientCode: string;

  @IsString()
  @Matches(NOT_BLANK, { message: 'no puede estar vacío' })
  obenCode: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateEquivalenceDto {
  @IsOptional()
  @IsString()
  @Matches(NOT_BLANK, { message: 'no puede estar vacío' })
  clientCode?: string;

  @IsOptional()
  @IsString()
  @Matches(NOT_BLANK, { message: 'no puede estar vacío' })
  obenCode?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
