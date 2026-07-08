import { IsUUID, IsOptional, IsEnum } from 'class-validator';
import { InvoiceStatus } from '../../../entities/invoice.entity';

export class CreateInvoiceDto {
  // Una factura siempre nace de una orden real ya persistida y confirmada.
  @IsUUID()
  orderId: string;
}

export class UpdateInvoiceStatusDto {
  @IsEnum(InvoiceStatus)
  status: InvoiceStatus;

  @IsOptional()
  paidAt?: string;
}
