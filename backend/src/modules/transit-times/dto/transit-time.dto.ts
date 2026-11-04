import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

const NOT_BLANK = /\S/;

export class CreateTransitTimeDto {
  @IsString()
  @Matches(NOT_BLANK, { message: 'no puede estar vacío' })
  pais: string;

  @IsString()
  @Matches(NOT_BLANK, { message: 'no puede estar vacío' })
  puerto: string;

  @IsString()
  @Matches(NOT_BLANK, { message: 'no puede estar vacío' })
  incoterm: string;

  @IsInt()
  @Min(0)
  @Max(365)
  oceanDays: number;

  @IsInt()
  @Min(0)
  @Max(365)
  inlandDays: number;
}

export class UpdateTransitTimeDto {
  @IsOptional() @IsString() @Matches(NOT_BLANK, { message: 'no puede estar vacío' }) pais?: string;
  @IsOptional() @IsString() @Matches(NOT_BLANK, { message: 'no puede estar vacío' }) puerto?: string;
  @IsOptional() @IsString() @Matches(NOT_BLANK, { message: 'no puede estar vacío' }) incoterm?: string;
  @IsOptional() @IsInt() @Min(0) @Max(365) oceanDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(365) inlandDays?: number;
}
