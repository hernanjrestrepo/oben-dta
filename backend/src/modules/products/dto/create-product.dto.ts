import {
  IsString,
  IsOptional,
  IsNumber,
  IsPositive,
  IsBoolean,
  MinLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  sku: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @IsPositive()
  price: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  stock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  committed?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  stock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  committed?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
