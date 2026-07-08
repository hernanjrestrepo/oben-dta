import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from '../services/dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('dashboard')
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Comprehensive dashboard data (tenant-scoped)' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiResponse({ status: 200 })
  async getDashboardData(@Query('days') days: number = 30) {
    return this.dashboardService.getDashboardData(Number(days));
  }

  @Get('production')
  @ApiOperation({ summary: 'Production KPIs (stub — Bloque 8)' })
  @ApiResponse({ status: 200 })
  async getProductionKPIs() {
    return this.dashboardService.getProductionKPIs();
  }

  @Get('sales')
  @ApiOperation({ summary: 'Sales KPIs (tenant-scoped)' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiResponse({ status: 200 })
  async getSalesKPIs(@Query('days') days: number = 30) {
    return this.dashboardService.getSalesKPIs(Number(days));
  }

  @Get('logistics')
  @ApiOperation({ summary: 'Logistics KPIs (stub — Bloque 8)' })
  @ApiResponse({ status: 200 })
  async getLogisticsKPIs() {
    return this.dashboardService.getLogisticsKPIs();
  }

  @Get('inventory')
  @ApiOperation({ summary: 'Inventory KPIs (tenant-scoped)' })
  @ApiResponse({ status: 200 })
  async getInventoryKPIs() {
    return this.dashboardService.getInventoryKPIs();
  }

  @Get('clients')
  @ApiOperation({ summary: 'Client KPIs (tenant-scoped)' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiResponse({ status: 200 })
  async getClientKPIs(@Query('days') days: number = 30) {
    return this.dashboardService.getClientKPIs(Number(days));
  }

  @Get('system')
  @ApiOperation({ summary: 'System KPIs (stub — Bloque 8)' })
  @ApiResponse({ status: 200 })
  async getSystemKPIs() {
    return this.dashboardService.getSystemKPIs();
  }

  @Get('trend')
  @ApiOperation({ summary: 'Trend data (orders only por ahora)' })
  @ApiQuery({ name: 'kpi', required: true, type: String })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiResponse({ status: 200 })
  async getTrendData(
    @Query('kpi') kpi: string,
    @Query('days') days: number = 30,
  ) {
    return this.dashboardService.getTrendData(kpi, Number(days));
  }
}
