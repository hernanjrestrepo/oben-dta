import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { FlowService, ProcessResult } from './flow.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

interface ProcessBody {
  text: string;
}

@UseGuards(JwtAuthGuard)
@Controller('flow')
export class FlowController {
  constructor(private readonly flowService: FlowService) {}

  @Post('process')
  async process(@Body() body: ProcessBody): Promise<ProcessResult> {
    return this.flowService.processOrder(body);
  }
}
