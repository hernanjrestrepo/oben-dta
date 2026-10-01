import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { FormatosService } from './formatos.service';

class FormatoDto {
  @IsString()
  @MaxLength(300)
  asunto!: string;

  @IsString()
  @MaxLength(5000)
  cuerpo!: string;
}

/**
 * Formatos de correo por documento/reporte (WO-027). Ver exige
 * `configuracion.read`; cambiar lo que reciben clientes y áreas de Oben exige
 * `configuracion.update`.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('formatos')
export class FormatosController {
  constructor(private readonly formatos: FormatosService) {}

  @Get()
  @RequirePermission('configuracion.read')
  listar() {
    return this.formatos.listar();
  }

  @Put(':clave')
  @RequirePermission('configuracion.update')
  guardar(@Param('clave') clave: string, @Body() dto: FormatoDto) {
    return this.formatos.guardar(clave, dto.asunto, dto.cuerpo);
  }

  @Delete(':clave')
  @RequirePermission('configuracion.update')
  restablecer(@Param('clave') clave: string) {
    return this.formatos.restablecer(clave);
  }

  @Post(':clave/vista-previa')
  @RequirePermission('configuracion.read')
  vistaPrevia(@Param('clave') clave: string, @Body() dto: FormatoDto) {
    return this.formatos.vistaPrevia(clave, dto.asunto, dto.cuerpo);
  }
}
