import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { DashboardService } from '../services/dashboard.service';
import { TestGuard } from '../common/guards/test.guard';

@ApiTags('dashboard')
@UseGuards(TestGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Get comprehensive dashboard data' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to look back (default: 30)',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns comprehensive dashboard data',
  })
  async getDashboardData(@Query('days') days: number = 30): Promise<any> {
    return await this.dashboardService.getDashboardData(days);
  }

  @Get('production')
  @ApiOperation({ summary: 'Get production KPIs' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to look back (default: 30)',
  })
  @ApiResponse({ status: 200, description: 'Returns production KPIs' })
  async getProductionKPIs(@Query('days') days: number = 30): Promise<any> {
    return await this.dashboardService.getProductionKPIs(days);
  }

  @Get('sales')
  @ApiOperation({ summary: 'Get sales KPIs' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to look back (default: 30)',
  })
  @ApiResponse({ status: 200, description: 'Returns sales KPIs' })
  async getSalesKPIs(@Query('days') days: number = 30): Promise<any> {
    return await this.dashboardService.getSalesKPIs(days);
  }

  @Get('logistics')
  @ApiOperation({ summary: 'Get logistics KPIs' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to look back (default: 30)',
  })
  @ApiResponse({ status: 200, description: 'Returns logistics KPIs' })
  async getLogisticsKPIs(@Query('days') days: number = 30): Promise<any> {
    return await this.dashboardService.getLogisticsKPIs(days);
  }

  @Get('inventory')
  @ApiOperation({ summary: 'Get inventory KPIs' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to look back (default: 30)',
  })
  @ApiResponse({ status: 200, description: 'Returns inventory KPIs' })
  async getInventoryKPIs(@Query('days') days: number = 30): Promise<any> {
    return await this.dashboardService.getInventoryKPIs(days);
  }

  @Get('clients')
  @ApiOperation({ summary: 'Get client KPIs' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to look back (default: 30)',
  })
  @ApiResponse({ status: 200, description: 'Returns client KPIs' })
  async getClientKPIs(@Query('days') days: number = 30): Promise<any> {
    return await this.dashboardService.getClientKPIs(days);
  }

  @Get('system')
  @ApiOperation({ summary: 'Get system KPIs' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to look back (default: 30)',
  })
  @ApiResponse({ status: 200, description: 'Returns system KPIs' })
  async getSystemKPIs(@Query('days') days: number = 30): Promise<any> {
    return await this.dashboardService.getSystemKPIs(days);
  }

  @Get('trend')
  @ApiOperation({ summary: 'Get trend data for a specific KPI' })
  @ApiQuery({
    name: 'kpi',
    required: true,
    type: String,
    description: 'KPI to get trend data for (orders, shipments, production)',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to look back (default: 30)',
  })
  @ApiQuery({
    name: 'interval',
    required: false,
    type: String,
    description: 'Interval for grouping (day, week, month) (default: day)',
  })
  @ApiResponse({ status: 200, description: 'Returns trend data' })
  async getTrendData(
    @Query('kpi') kpi: string,
    @Query('days') days: number = 30,
    @Query('interval') interval: 'day' | 'week' | 'month' = 'day',
  ): Promise<any[]> {
    return await this.dashboardService.getTrendData(kpi, days, interval);
  }
}
