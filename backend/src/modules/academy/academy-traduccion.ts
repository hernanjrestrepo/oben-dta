import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { TraductorService, traducirCampos, type IdiomaServidor } from '../traduccion/traductor.service';
import { ACADEMY_INTRO, MODULOS_ACADEMY } from './academy-catalogo';

/**
 * Campos de contenido de Xmart Academy que se muestran en el idioma de la persona (24-oct). Las claves, rutas, estados
 * y el grupo (la pantalla agrupa por él) no se tocan.
 */
const CAMPOS = new Set(['titulo', 'resumen', 'paraQue', 'quienes', 'detalle', 'reglas', 'texto', 'pregunta', 'opciones', 'explicacion', 'termino', 'definicion']);

/** Devuelve una copia con los textos de contenido traducidos (en un solo lote). */
export function traducirContenido<T>(original: T, idioma: IdiomaServidor, traductor: TraductorService): Promise<T> {
  return traducirCampos(original, CAMPOS, idioma, traductor, 60_000);
}

/**
 * Al arrancar, deja traducido todo el catálogo (lecciones, recorrido, glosario) en inglés, portugués y francés, para
 * que nadie espere al abrir una lección. Solo pide al modelo lo que no está ya en la tabla `traducciones`.
 */
@Injectable()
export class AcademyPrecalentarTraducciones implements OnApplicationBootstrap {
  private readonly logger = new Logger(AcademyPrecalentarTraducciones.name);

  constructor(private readonly traductor: TraductorService) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return;
    setTimeout(() => void this.precalentar(), 30_000);
  }

  async precalentar(): Promise<void> {
    for (const idioma of ['en', 'pt', 'fr'] as const) {
      try {
        const inicio = Date.now();
        await traducirContenido({ modulos: MODULOS_ACADEMY, intro: ACADEMY_INTRO }, idioma, this.traductor);
        this.logger.log(`Xmart Academy traducida al ${idioma} (${Math.round((Date.now() - inicio) / 1000)} s).`);
      } catch (err) {
        this.logger.warn(`No se pudo pretraducir Xmart Academy al ${idioma}: ${(err as Error).message}`);
      }
    }
  }
}
