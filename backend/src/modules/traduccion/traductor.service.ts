import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, mergeMap } from 'rxjs';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { crearMiaLlm, type MiaLlm } from '../eva/mia-llm';

/**
 * Traducción de textos del servidor (Hernán, 24-oct: Oben Xmart en español, inglés, portugués y francés). El español
 * es la fuente; lo demás lo traduce el modelo de MIA una sola vez y queda guardado (tabla `traducciones` y memoria).
 * Nunca bloquea: si el modelo falla o tarda, sale el texto en español.
 */
export type IdiomaServidor = 'es' | 'en' | 'pt' | 'fr';

const NOMBRES: Record<Exclude<IdiomaServidor, 'es'>, string> = { en: 'inglés', pt: 'portugués de Brasil', fr: 'francés' };
const LOTE = 40;
const MAX_MEMORIA = 5000;

/** Idioma pedido por el navegador (Accept-Language), o español. */
export function idiomaDe(cabecera: string | string[] | undefined | null): IdiomaServidor {
  const v = (Array.isArray(cabecera) ? cabecera[0] : cabecera ?? '').trim().slice(0, 2).toLowerCase();
  return v === 'en' || v === 'pt' || v === 'fr' ? v : 'es';
}

const huella = (t: string) => createHash('sha256').update(t).digest('hex');

@Injectable()
export class TraductorService {
  private readonly logger = new Logger(TraductorService.name);
  private readonly memoria = new Map<string, string>();
  private readonly llm: MiaLlm | null;

  constructor(@InjectDataSource() private readonly ds: DataSource) {
    this.llm = crearMiaLlm(process.env, (err) => this.logger.warn(`Modelo de traducción falló, se intenta el siguiente: ${(err as Error).message}`));
  }

  /** Traduce un texto. Sin modelo o con error, devuelve el original. */
  async uno(texto: string, idioma: IdiomaServidor, timeoutMs = 8000): Promise<string> {
    return (await this.varios([texto], idioma, timeoutMs))[0];
  }

  /**
   * Traduce varios textos en el mismo orden. Los que ya estaban traducidos salen de la memoria o la base; los nuevos
   * van al modelo en lotes. Con `timeoutMs`, lo que no alcance a traducirse sale en español (y queda pidiéndose).
   */
  async varios(textos: string[], idioma: IdiomaServidor, timeoutMs?: number): Promise<string[]> {
    if (idioma === 'es' || textos.length === 0) return textos;
    const trabajo = this.resolver(textos, idioma);
    if (!timeoutMs) return trabajo;
    let timer: NodeJS.Timeout | undefined;
    const limite = new Promise<string[]>((resolve) => {
      timer = setTimeout(() => resolve(textos.map((t) => this.memoria.get(`${idioma}:${t}`) ?? t)), timeoutMs);
    });
    try {
      return await Promise.race([trabajo, limite]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async resolver(textos: string[], idioma: Exclude<IdiomaServidor, 'es'>): Promise<string[]> {
    const traducibles = [...new Set(textos.filter((t) => typeof t === 'string' && /[A-Za-zÁÉÍÓÚáéíóúÑñ]{2}/.test(t)))];
    const faltan = traducibles.filter((t) => !this.memoria.has(`${idioma}:${t}`));
    if (faltan.length) {
      try {
        const filas = await this.ds.query<Array<{ hash: string; texto: string }>>(`SELECT hash, texto FROM traducciones WHERE idioma = $1 AND hash = ANY($2)`, [
          idioma,
          faltan.map(huella),
        ]);
        const porHash = new Map(filas.map((f) => [f.hash, f.texto]));
        for (const t of faltan) {
          const x = porHash.get(huella(t));
          if (x) this.recordar(idioma, t, x);
        }
      } catch (err) {
        this.logger.warn(`No se pudo leer el caché de traducciones: ${(err as Error).message}`);
      }
    }
    const nuevos = traducibles.filter((t) => !this.memoria.has(`${idioma}:${t}`));
    for (let i = 0; i < nuevos.length; i += LOTE) await this.traducirLote(nuevos.slice(i, i + LOTE), idioma);
    return textos.map((t) => this.memoria.get(`${idioma}:${t}`) ?? t);
  }

  private async traducirLote(lote: string[], idioma: Exclude<IdiomaServidor, 'es'>): Promise<void> {
    if (!this.llm) return;
    try {
      const r = await this.llm.completar(
        [
          {
            role: 'system',
            content:
              `Traduces textos de la plataforma Oben Xmart (Oben Group, películas plásticas BOPP/BOPET) del español al ${NOMBRES[idioma]}. ` +
              'Reglas: traducción natural y profesional, del mismo largo aproximado; conserva exactamente números, fechas, montos, códigos, correos, URLs, ' +
              'nombres propios de personas, clientes y productos, y los términos OV, PF, OC, OBEN MAS, COMEX, Incoterm, FOB, CIF, CFR, DAP, DDP, HMF, ISF, ' +
              'Entry Fee, Inland, TRM, DIAN, CUFE, Oben Xmart, Xmart Academy, MIA, Paradixe. Conserva el formato (saltos de línea, viñetas, comillas). ' +
              'Responde SOLO un arreglo JSON de strings, con exactamente el mismo número de elementos y en el mismo orden.',
          },
          { role: 'user', content: JSON.stringify(lote) },
        ],
        [],
      );
      const inicio = r.texto.indexOf('[');
      const fin = r.texto.lastIndexOf(']');
      const arreglo = JSON.parse(r.texto.slice(inicio, fin + 1)) as unknown;
      if (!Array.isArray(arreglo) || arreglo.length !== lote.length || !arreglo.every((x) => typeof x === 'string' && x.trim())) {
        throw new Error(`respuesta con ${Array.isArray(arreglo) ? arreglo.length : '?'} elementos para ${lote.length}`);
      }
      const valores: unknown[] = [];
      lote.forEach((t, i) => {
        const x = (arreglo[i] as string).trim();
        this.recordar(idioma, t, x);
        valores.push(idioma, huella(t), t, x);
      });
      const marcas = lote.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(', ');
      await this.ds.query(`INSERT INTO traducciones (idioma, hash, origen, texto) VALUES ${marcas} ON CONFLICT (idioma, hash) DO NOTHING`, valores);
    } catch (err) {
      // Si un lote grande falla, se intenta texto por texto (un solo texto raro no tumba los demás).
      if (lote.length > 1) {
        for (const t of lote) await this.traducirLote([t], idioma);
      } else {
        this.logger.warn(`No se pudo traducir al ${idioma}: ${(err as Error).message}`);
      }
    }
  }

  private recordar(idioma: string, origen: string, texto: string) {
    if (this.memoria.size >= MAX_MEMORIA) this.memoria.delete(this.memoria.keys().next().value as string);
    this.memoria.set(`${idioma}:${origen}`, texto);
  }
}

type Ruta = { padre: Record<string, unknown> | unknown[]; clave: string | number };

/**
 * Copia de `original` con los textos de los campos indicados traducidos en un solo lote (strings o listas de strings,
 * a cualquier profundidad). Nunca cambia el original: muchas respuestas apuntan a constantes compartidas.
 */
export async function traducirCampos<T>(original: T, campos: ReadonlySet<string>, idioma: IdiomaServidor, traductor: TraductorService, timeoutMs = 15_000): Promise<T> {
  if (idioma === 'es' || original === null || original === undefined) return original;
  const obj = structuredClone(original);
  const rutas: Ruta[] = [];
  const textos: string[] = [];
  const visitar = (nodo: unknown, enCampo: boolean) => {
    if (Array.isArray(nodo)) {
      nodo.forEach((v, i) => {
        if (typeof v === 'string' && enCampo) {
          rutas.push({ padre: nodo, clave: i });
          textos.push(v);
        } else visitar(v, enCampo);
      });
    } else if (nodo && typeof nodo === 'object' && !(nodo instanceof Date) && !Buffer.isBuffer(nodo)) {
      for (const [k, v] of Object.entries(nodo as Record<string, unknown>)) {
        const esCampo = campos.has(k);
        if (typeof v === 'string' && esCampo) {
          rutas.push({ padre: nodo as Record<string, unknown>, clave: k });
          textos.push(v);
        } else visitar(v, esCampo);
      }
    }
  };
  visitar(obj, false);
  if (!textos.length) return obj;
  const traducidos = await traductor.varios(textos, idioma, timeoutMs);
  rutas.forEach((r, i) => {
    (r.padre as Record<string | number, unknown>)[r.clave] = traducidos[i];
  });
  return obj;
}

/** Marca un endpoint para que esos campos de su respuesta salgan en el idioma de la persona (Accept-Language). */
export const TRADUCIR_CAMPOS = 'traducir-campos';
export const TraducirCampos = (...campos: string[]) => SetMetadata(TRADUCIR_CAMPOS, campos);

@Injectable()
export class TraduccionInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly traductor: TraductorService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const campos = this.reflector.get<string[] | undefined>(TRADUCIR_CAMPOS, ctx.getHandler());
    if (!campos?.length || ctx.getType() !== 'http') return next.handle();
    const idioma = idiomaDe(ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>().headers['accept-language']);
    if (idioma === 'es') return next.handle();
    const set = new Set(campos);
    return next.handle().pipe(mergeMap((r) => traducirCampos(r, set, idioma, this.traductor)));
  }
}
