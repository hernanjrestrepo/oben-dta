import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class UpsertScenarioBodyDto {
  @IsString()
  @MinLength(2)
  system: string;

  @IsString()
  @MinLength(2)
  operation: string;

  @IsString()
  @MinLength(2)
  behavior: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  latencyMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  jitterMs?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(599)
  httpStatus?: number;

  @IsOptional()
  @IsString()
  errorCode?: string;

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  errorRatio?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
