import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { DistributionEntityType } from '../../../entities/distribution-list-association.entity';
import type { DistributionRecipientRole } from '../../../entities/distribution-list-recipient.entity';

export class RecipientDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsIn(['to', 'cc', 'bcc'])
  role: DistributionRecipientRole;
}

export class CreateDistributionListDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  recipients: RecipientDto[];
}

export class UpdateDistributionListDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  recipients?: RecipientDto[];
}

export class AssociateDistributionListDto {
  @IsIn(['document', 'transaction', 'report'])
  entityType: DistributionEntityType;

  @IsString()
  @MinLength(1)
  entityKey: string;
}
