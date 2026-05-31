import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AIService } from '../services/ai.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AIController {
  constructor(private readonly aiService: AIService) {}

  @Get('production-efficiency')
  @ApiOperation({ summary: 'Analyze production efficiency' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to analyze (default: 30)',
  })
  @ApiQuery({
    name: 'productId',
    required: false,
    type: String,
    description: 'Filter by product ID',
  })
  @ApiQuery({
    name: 'productionLine',
    required: false,
    type: String,
    description: 'Filter by production line',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns production efficiency analysis',
  })
  async getProductionEfficiencyAnalysis(
    @Query('days') days: number = 30,
    @Query('productId') productId?: string,
    @Query('productionLine') productionLine?: string,
  ): Promise<any> {
    return await this.aiService.getProductionEfficiencyAnalysis(
      days,
      productId,
      productionLine,
    );
  }

  @Get('demand-prediction/:productId')
  @ApiOperation({ summary: 'Predict demand for a product' })
  @ApiParam({ name: 'productId', type: String })
  @ApiQuery({
    name: 'monthsAhead',
    required: false,
    type: Number,
    description: 'Months to predict ahead (default: 3)',
  })
  @ApiResponse({ status: 200, description: 'Returns demand prediction' })
  async getProductDemandPrediction(
    @Param('productId') productId: string,
    @Query('monthsAhead') monthsAhead: number = 3,
  ): Promise<any> {
    return await this.aiService.getProductDemandPrediction(
      productId,
      monthsAhead,
    );
  }

  @Get('credit-risk/:clientId')
  @ApiOperation({ summary: 'Analyze client credit risk' })
  @ApiParam({ name: 'clientId', type: String })
  @ApiResponse({
    status: 200,
    description: 'Returns client credit risk analysis',
  })
  async getClientCreditRiskAnalysis(
    @Param('clientId') clientId: string,
  ): Promise<any> {
    return await this.aiService.getClientCreditRiskAnalysis(clientId);
  }

  @Get('inventory-optimization')
  @ApiOperation({ summary: 'Get inventory optimization recommendations' })
  @ApiResponse({
    status: 200,
    description: 'Returns inventory optimization recommendations',
  })
  async getInventoryOptimization(): Promise<any> {
    return await this.aiService.getInventoryOptimization();
  }

  @Get('shipment-optimization')
  @ApiOperation({ summary: 'Analyze shipment route optimization' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to analyze (default: 30)',
  })
  @ApiQuery({
    name: 'destination',
    required: false,
    type: String,
    description: 'Filter by destination',
  })
  @ApiQuery({
    name: 'carrier',
    required: false,
    type: String,
    description: 'Filter by carrier',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns shipment optimization analysis',
  })
  async getShipmentRouteOptimization(
    @Query('days') days: number = 30,
    @Query('destination') destination?: string,
    @Query('carrier') carrier?: string,
  ): Promise<any> {
    return await this.aiService.getShipmentRouteOptimization(
      days,
      destination,
      carrier,
    );
  }

  @Post('analyze-content')
  @ApiOperation({ summary: 'Classify and analyze content' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        categories: {
          type: 'array',
          items: { type: 'string' },
        },
        context: { type: 'string' },
      },
      required: ['content'],
    },
  })
  @ApiResponse({ status: 200, description: 'Returns content analysis' })
  async analyzeContent(
    @Body() body: { content: string; categories?: string[]; context?: string },
  ): Promise<any> {
    const { content, categories = [], context = '' } = body;

    if (categories && categories.length > 0) {
      return await this.aiService.classifyContent(content, categories);
    } else {
      return await this.aiService.generateBusinessInsights(content, context);
    }
  }

  @Post('extract-information')
  @ApiOperation({ summary: 'Extract information from document' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        document: { type: 'string' },
        fields: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['document', 'fields'],
    },
  })
  @ApiResponse({ status: 200, description: 'Returns extracted information' })
  async extractInformation(
    @Body() body: { document: string; fields: string[] },
  ): Promise<any> {
    return await this.aiService.extractInformation(body.document, body.fields);
  }

  @Post('business-insights')
  @ApiOperation({ summary: 'Generate business insights from data' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        data: { type: 'object' },
        context: { type: 'string' },
      },
      required: ['data', 'context'],
    },
  })
  @ApiResponse({ status: 200, description: 'Returns business insights' })
  async generateBusinessInsights(
    @Body() body: { data: any; context: string },
  ): Promise<any> {
    return await this.aiService.generateBusinessInsights(
      body.data,
      body.context,
    );
  }
}
