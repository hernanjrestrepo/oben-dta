import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { EvaService, EvaChatResult } from './eva.service';

class MiaTurnoDto {
  @IsIn(['usuario', 'mia'])
  rol: 'usuario' | 'mia';

  @IsString()
  @MaxLength(8000)
  texto: string;
}

class MiaContextoDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  ruta?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  ov?: number;
}

class EvaChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;

  /** Conversación previa del chat (MIA no guarda estado entre preguntas). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => MiaTurnoDto)
  historial?: MiaTurnoDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => MiaContextoDto)
  contexto?: MiaContextoDto;
}

/**
 * Hablar con MIA exige solo `dashboard.view` (lo tiene todo perfil, también
 * los de Consulta): el control real está en cada herramienta, que verifica el
 * mismo permiso que su endpoint REST — y `crear_cotizacion` exige
 * `quotes.create`, así que un perfil de Consulta nunca crea nada vía MIA.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('eva')
export class EvaController {
  constructor(private readonly evaService: EvaService) {}

  @Post('chat')
  @RequirePermission('dashboard.view')
  async chat(@Body() dto: EvaChatDto): Promise<EvaChatResult> {
    return this.evaService.chat(
      dto.message,
      dto.historial ?? [],
      dto.contexto ?? {},
    );
  }
}
