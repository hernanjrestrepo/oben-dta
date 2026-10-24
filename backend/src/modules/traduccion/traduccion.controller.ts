import { Body, Controller, Headers, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { TraductorService, idiomaDe } from './traductor.service';

class TraducirDto {
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  @MaxLength(600, { each: true })
  textos!: string[];
}

/**
 * Traduce para mostrar textos que la pantalla recibe del servidor y usa en español para su lógica (avisos y faltantes
 * de la liquidación, por ejemplo). Solo sesión: no expone datos, solo traduce lo que la pantalla ya tiene.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('traduccion')
export class TraduccionController {
  constructor(private readonly traductor: TraductorService) {}

  @Post()
  @HttpCode(200)
  async traducir(@Body() dto: TraducirDto, @Headers('accept-language') lang?: string) {
    const idioma = idiomaDe(lang);
    return { idioma, textos: await this.traductor.varios(dto.textos, idioma, 20_000) };
  }
}
