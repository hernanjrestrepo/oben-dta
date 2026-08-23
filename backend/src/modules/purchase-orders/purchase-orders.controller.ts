import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { PurchaseOrdersService } from './purchase-orders.service';
import { ProcessPurchaseOrderEmailDto } from './dto/process-purchase-order-email.dto';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { Idempotent } from '../idempotency/idempotent.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrders: PurchaseOrdersService) {}

  @Post('email')
  @RequirePermission('orders.create')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent('purchase_order_email')
  async receiveEmail(@Body() dto: ProcessPurchaseOrderEmailDto) {
    return this.purchaseOrders.processIncomingEmail(dto);
  }

  @Get()
  @RequirePermission('orders.read')
  async findAll() {
    return this.purchaseOrders.findAll();
  }

  @Get(':id')
  @RequirePermission('orders.read')
  async findOne(@Param('id') id: string) {
    return this.purchaseOrders.findOne(id);
  }
}
