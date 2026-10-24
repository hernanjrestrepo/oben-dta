import { Body, Controller, Get, Headers, Param, ParseIntPipe, Post, Put, Query, UseGuards, DefaultValuePipe } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { AcademyService } from './academy.service';
import { TraductorService, idiomaDe } from '../traduccion/traductor.service';
import { traducirContenido } from './academy-traduccion';

class VistoDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  segundos?: number;
}

class QuizDto {
  /** { idPregunta: índiceDeLaOpción } */
  @IsObject()
  respuestas!: Record<string, number>;
}

class EventoDto {
  @IsIn(['leccion_abierta', 'tiempo', 'ir_al_modulo', 'preguntar_mia', 'captura_vista', 'glosario', 'recorrido'])
  tipo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  modulo?: string | null;

  @IsOptional()
  @IsObject()
  detalle?: Record<string, unknown>;
}

class AjustesDto {
  @IsOptional()
  @IsBoolean()
  exigirCertificacion?: boolean;

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(100)
  puntajeMinimo?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  exentos?: string[];
}

/**
 * Xmart Academy. Las rutas del plan propio (plan, lección, quiz, eventos) solo exigen sesión: cada persona ve lo de
 * su perfil (como `GET /security/me/permissions`). El panel de fricciones y los ajustes son de quien administra
 * perfiles (`security.read` / `security.update`).
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('academy')
export class AcademyController {
  constructor(
    private readonly academy: AcademyService,
    private readonly traductor: TraductorService,
  ) {}

  // El contenido sale en el idioma de la persona (Accept-Language); el español es la fuente.
  @Get('plan')
  async plan(@Headers('accept-language') lang?: string) {
    return traducirContenido(await this.academy.plan(), idiomaDe(lang), this.traductor);
  }

  @Get('glosario')
  glosario(@Headers('accept-language') lang?: string) {
    return traducirContenido(this.academy.glosario(), idiomaDe(lang), this.traductor);
  }

  @Get('modulos/:key')
  async modulo(@Param('key') key: string, @Headers('accept-language') lang?: string) {
    return traducirContenido(await this.academy.modulo(key), idiomaDe(lang), this.traductor);
  }

  @Post('modulos/:key/visto')
  visto(@Param('key') key: string, @Body() dto: VistoDto) {
    return this.academy.visto(key, dto.segundos ?? 0);
  }

  @Post('modulos/:key/quiz')
  async quiz(@Param('key') key: string, @Body() dto: QuizDto, @Headers('accept-language') lang?: string) {
    return traducirContenido(await this.academy.responderQuiz(key, dto.respuestas), idiomaDe(lang), this.traductor);
  }

  @Post('eventos')
  evento(@Body() dto: EventoDto) {
    return this.academy.registrarEventoDePantalla(dto.tipo, dto.modulo ?? null, dto.detalle ?? {});
  }

  @Get('fricciones')
  @RequirePermission('security.read')
  fricciones(@Query('dias', new DefaultValuePipe(30), ParseIntPipe) dias: number) {
    return this.academy.fricciones(dias);
  }

  @Get('ajustes')
  @RequirePermission('security.read')
  ajustes() {
    return this.academy.ajustes();
  }

  @Put('ajustes')
  @RequirePermission('security.update')
  guardarAjustes(@Body() dto: AjustesDto) {
    return this.academy.guardarAjustes(dto);
  }
}
