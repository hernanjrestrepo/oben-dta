import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  ValidationPipe,
  UsePipes,
  UseGuards,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import {
  CreateInvoiceDto,
  UpdateInvoiceStatusDto,
} from './dto/create-invoice.dto';
import { Invoice } from '../../entities/invoice.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @RequirePermission('invoices.create')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async create(@Body() dto: CreateInvoiceDto): Promise<Invoice> {
    return this.invoicesService.createFromOrder(dto);
  }

  @Get()
  @RequirePermission('invoices.read')
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<Invoice[]> {
    return this.invoicesService.findAll(page ? +page : 1, limit ? +limit : 50);
  }

  @Get(':id')
  @RequirePermission('invoices.read')
  async findOne(@Param('id') id: string): Promise<Invoice> {
    return this.invoicesService.findOne(id);
  }

  @Put(':id/status')
  @RequirePermission('invoices.update')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceStatusDto,
  ): Promise<Invoice> {
    return this.invoicesService.updateStatus(id, dto);
  }
}
