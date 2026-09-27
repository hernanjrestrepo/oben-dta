import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { EvaService, EvaChatResult } from './eva.service';

class EvaChatDto {
  @IsString()
  @MinLength(1)
  message: string;
}

/** EVA puede crear cotizaciones reales (herramienta `crear_cotizacion`) — exige `quotes.create`. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('eva')
export class EvaController {
  constructor(private readonly evaService: EvaService) {}

  @Post('chat')
  @RequirePermission('quotes.create')
  async chat(@Body() dto: EvaChatDto): Promise<EvaChatResult> {
    return this.evaService.chat(dto.message);
  }
}
