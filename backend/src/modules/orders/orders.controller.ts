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
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../auth/dto/auth.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SALES)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async create(
    @Body() dto: CreateOrderDto,
    @CurrentUser('sub') userId: string,
  ): Promise<Order> {
    return this.ordersService.create(dto, userId);
  }

  @Get()
  async findAll(
    @CurrentUser('sub') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<Order[]> {
    return this.ordersService.findAll(userId, page ? +page : 1, limit ? +limit : 50);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() requestingUser: RequestingUser,
  ): Promise<Order> {
    return this.ordersService.findOne(id, requestingUser);
  }

  @Put(':id/status')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.PRODUCTION)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() requestingUser: RequestingUser,
  ): Promise<Order> {
    return this.ordersService.updateStatus(id, dto, requestingUser);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async remove(
    @Param('id') id: string,
    @CurrentUser() requestingUser: RequestingUser,
  ): Promise<{ message: string }> {
    await this.ordersService.remove(id, requestingUser);
    return { message: 'Orden eliminada exitosamente' };
  }
}
