import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateEquivalenceDto {
  @IsUUID()
  clientId: string;

  @IsString()
  @MinLength(1)
  clientCode: string;

  @IsString()
  @MinLength(1)
  obenCode: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateEquivalenceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  clientCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  obenCode?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
