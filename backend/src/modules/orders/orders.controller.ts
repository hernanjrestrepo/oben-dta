import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ValidationPipe,
  UsePipes,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import type { RequestingUser } from './orders.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/create-order.dto';
import { Order } from '../../entities/order.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @RequirePermission('orders.create')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async create(
    @Body() dto: CreateOrderDto,
    @CurrentUser('sub') userId: string,
  ): Promise<Order> {
    return this.ordersService.create(dto, userId);
  }

  @Get()
  @RequirePermission('orders.read')
  async findAll(
    @CurrentUser() requestingUser: RequestingUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<Order[]> {
    return this.ordersService.findAll(requestingUser, page ? +page : 1, limit ? +limit : 50);
  }

  @Get(':id')
  @RequirePermission('orders.read')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() requestingUser: RequestingUser,
  ): Promise<Order> {
    return this.ordersService.findOne(id, requestingUser);
  }

  @Put(':id/status')
  @RequirePermission('orders.update')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() requestingUser: RequestingUser,
  ): Promise<Order> {
    return this.ordersService.updateStatus(id, dto, requestingUser);
  }

  @Delete(':id')
  @RequirePermission('orders.delete')
  async remove(
    @Param('id') id: string,
    @CurrentUser() requestingUser: RequestingUser,
  ): Promise<{ message: string }> {
    await this.ordersService.remove(id, requestingUser);
    return { message: 'Orden eliminada exitosamente' };
  }
}
