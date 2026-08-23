import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseOrderAttachmentDto {
  @IsString()
  filename: string;

  @IsOptional()
  @IsString()
  mimeType?: string;
}

export class ProcessPurchaseOrderEmailDto {
  @IsEmail()
  from: string;

  @IsString()
  subject: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderAttachmentDto)
  attachments?: PurchaseOrderAttachmentDto[];

  /** Message-ID real del correo, si el intake lo provee — usado por IdempotencyInterceptor. */
  @IsOptional()
  @IsString()
  messageId?: string;
}
