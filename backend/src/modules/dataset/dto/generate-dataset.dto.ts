import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export type DatasetPreset = 'small' | 'full';

export class GenerateDatasetDto {
  @IsString()
  tenantId: string;

  @IsOptional() @IsInt()
  seed?: number;

  @IsOptional() @IsIn(['small', 'full'])
  preset?: DatasetPreset;

  @IsOptional() @IsInt() @Min(1) @Max(50_000)
  clients?: number;

  @IsOptional() @IsInt() @Min(1) @Max(200_000)
  products?: number;

  @IsOptional() @IsInt() @Min(1) @Max(500_000)
  orders?: number;

  @IsOptional() @IsBoolean()
  reset?: boolean;
}
