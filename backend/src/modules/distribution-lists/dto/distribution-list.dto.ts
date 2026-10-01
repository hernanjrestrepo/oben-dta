import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { DistributionEntityType } from '../../../entities/distribution-list-association.entity';
import type { DisparadorLista } from '../../../entities/distribution-list.entity';
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

  /** Dueños de la lista (WO-026). Solo administración los cambia. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  ownerUserIds?: string[];

  @IsOptional()
  @IsIn(['automatico', 'manual'])
  disparador?: DisparadorLista;
}

/** Lo que un dueño puede cambiar de su lista: solo los destinatarios. */
export class UpdateRecipientsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  recipients: RecipientDto[];
}

/** "Enviar ahora": qué documento de la lista y de qué orden. */
export class EnviarListaDto {
  @IsString()
  @MinLength(2)
  clave: string;

  @IsInt()
  @IsPositive()
  ov: number;
}

export class AssociateDistributionListDto {
  @IsIn(['document', 'transaction', 'report'])
  entityType: DistributionEntityType;

  @IsString()
  @MinLength(1)
  entityKey: string;
}
