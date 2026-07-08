import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { EvaOrchestratorService, EvaResult } from './eva-orchestrator.service';
import { OllamaService } from './ollama.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class EvaProcessDto {
  @IsString()
  @MinLength(2)
  text: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('eva')
export class EvaController {
  constructor(
    private readonly orchestrator: EvaOrchestratorService,
    private readonly ollama: OllamaService,
  ) {}

  @Post('process')
  @RequirePermission('ia.use')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async process(
    @Body() dto: EvaProcessDto,
    @CurrentUser('sub') userId: string,
  ): Promise<EvaResult> {
    return this.orchestrator.process(dto.text, userId);
  }

  @Get('health')
  async health(): Promise<{ status: string; model: string }> {
    return this.ollama.healthCheck();
  }
}
