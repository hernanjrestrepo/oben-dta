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
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../auth/dto/auth.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SALES)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async create(
    @Body() dto: CreateClientDto,
    @CurrentUser('sub') userId: string,
  ): Promise<Client> {
    return this.clientsService.create(dto, userId);
  }

  @Get()
  async findAll(
    @CurrentUser('sub') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<Client[]> {
    return this.clientsService.findAll(userId, page ? +page : 1, limit ? +limit : 50);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() requestingUser: RequestingUser,
  ): Promise<Client> {
    return this.clientsService.findOne(id, requestingUser);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() requestingUser: RequestingUser,
  ): Promise<Client> {
    return this.clientsService.update(id, dto, requestingUser);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async remove(
    @Param('id') id: string,
    @CurrentUser() requestingUser: RequestingUser,
  ): Promise<{ message: string }> {
    await this.clientsService.remove(id, requestingUser);
    return { message: 'Cliente eliminado exitosamente' };
  }
}
