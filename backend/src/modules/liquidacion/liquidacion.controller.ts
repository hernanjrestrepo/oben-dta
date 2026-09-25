import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsObject, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { LiquidacionService } from './liquidacion.service';
import type { LiquidacionHeaderValues, LiquidacionLineValues } from './liquidacion.types';

export const LIQUIDACION_PERMISSION = 'exportations.liquidate';

class LiquidacionInputDto {
  @IsOptional()
  @IsObject()
  header?: LiquidacionHeaderValues;

  @IsOptional()
  @IsObject()
  lines?: Record<string, LiquidacionLineValues>;

  /** Sin `confirm: true` solo se simula: no se escribe nada en Oben. */
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;

  @IsOptional()
  @IsBoolean()
  resume?: boolean;

  @IsOptional()
  @IsBoolean()
  acknowledgeAmbiguous?: boolean;

  @IsOptional()
  @IsInt()
  headId?: number;
}

/**
 * Todas las rutas exigen `exportations.liquidate` (ya existe en el catálogo;
 * lo recibe `tenant.admin`, no `tenant.viewer`): submit con `confirm:true` crea
 * registros reales en el ERP de Oben, y el borrador expone valores financieros.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('liquidacion')
export class LiquidacionController {
  constructor(private readonly liquidacion: LiquidacionService) {}

  /** Borrador de solo lectura: consulta spCheckSettlement y muestra qué falta. */
  @Get(':numberPF/draft')
  @RequirePermission(LIQUIDACION_PERMISSION)
  draft(@Param('numberPF') numberPF: string) {
    return this.liquidacion.getDraft(numberPF);
  }

  /** Igual que el borrador pero con los valores que digita el usuario (dirección, puertos, partidas...). */
  @Post(':numberPF/draft')
  @RequirePermission(LIQUIDACION_PERMISSION)
  draftWithInput(@Param('numberPF') numberPF: string, @Body() dto: LiquidacionInputDto) {
    return this.liquidacion.getDraft(numberPF, { header: dto.header, lines: dto.lines });
  }

  /** Simula por defecto; con `confirm:true` crea encabezado + detalles reales en Oben. */
  @Post(':numberPF/submit')
  @RequirePermission(LIQUIDACION_PERMISSION)
  submit(@Param('numberPF') numberPF: string, @Body() dto: LiquidacionInputDto) {
    return this.liquidacion.submit(
      numberPF,
      { header: dto.header, lines: dto.lines },
      {
        confirm: dto.confirm,
        resume: dto.resume,
        acknowledgeAmbiguous: dto.acknowledgeAmbiguous,
        headId: dto.headId,
      },
    );
  }
}
