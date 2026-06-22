import {
  IsString,
  IsOptional,
  IsNumber,
  IsPositive,
  IsUUID,
  IsEnum,
  MinLength,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '../../../entities/order.entity';

export class CreateOrderItemDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;
}

export class CreateOrderDto {
  @IsUUID()
  clientId: string;

  @IsString()
  @MinLength(3)
  orderNumber: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @IsOptional()
  @IsString()
  blockedReason?: string;

  @IsOptional()
  @IsString()
  validatedBy?: string;
}
