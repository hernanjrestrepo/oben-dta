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
import { ClientsService } from './clients.service';
import type { RequestingUser } from './clients.service';
import { CreateClientDto, UpdateClientDto } from './dto/create-client.dto';
import { Client } from '../../entities/client.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @RequirePermission('clients.create')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async create(
    @Body() dto: CreateClientDto,
    @CurrentUser('sub') userId: string,
  ): Promise<Client> {
    return this.clientsService.create(dto, userId);
  }

  @Get()
  @RequirePermission('clients.read')
  async findAll(
    @CurrentUser() requestingUser: RequestingUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<Client[]> {
    return this.clientsService.findAll(requestingUser, page ? +page : 1, limit ? +limit : 50);
  }

  @Get(':id')
  @RequirePermission('clients.read')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() requestingUser: RequestingUser,
  ): Promise<Client> {
    return this.clientsService.findOne(id, requestingUser);
  }

  @Put(':id')
  @RequirePermission('clients.update')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() requestingUser: RequestingUser,
  ): Promise<Client> {
    return this.clientsService.update(id, dto, requestingUser);
  }

  @Delete(':id')
  @RequirePermission('clients.delete')
  async remove(
    @Param('id') id: string,
    @CurrentUser() requestingUser: RequestingUser,
  ): Promise<{ message: string }> {
    await this.clientsService.remove(id, requestingUser);
    return { message: 'Cliente eliminado exitosamente' };
  }
}
