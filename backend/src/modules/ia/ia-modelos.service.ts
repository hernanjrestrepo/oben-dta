import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { IaUso, TipoIa } from '../../entities/ia-uso.entity';
import { Tenant } from '../../entities/tenant.entity';
import {
  ModeloImagenCatalogo,
  ModeloVideoCatalogo,
  NivelCalidad,
  NIVELES,
  OpcionVideo,
  PedidoVideo,
  Topes,
  elegirImagen,
  opcionesVideo,
  topesDe,
  verificarTopes,
} from './ia-selector';

const BASE = (process.env.OPENROUTER_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const MAX_PROMPT = 1500;
const MAX_EN_PROCESO = 3;
const CACHE_MS = 60 * 60_000;

export interface GastoIa {
  hoyUsd: number;
  mesUsd: number;
  enProceso: number;
  topes: Topes;
}

export interface ImagenGenerada {
  usoId: string;
  modelo: string;
  nivel: NivelCalidad;
  costoUsd: number;
  mime: string;
  buffer: Buffer;
}

export interface VideoIniciado {
  usoId: string;
  modelo: string;
  nivel: NivelCalidad;
  estimadoUsd: number;
  duracion: number;
  resolucion: string;
  audio: boolean;
}

export interface EstadoVideo {
  usoId: string;
  estado: 'en_proceso' | 'completado' | 'fallido';
  modelo: string;
  costoUsd: number | null;
  error?: string;
  buffer?: Buffer;
}

/** Hora de Bogotá (UTC−5 fijo): inicio del día y del mes en UTC. */
export function inicioDiaBogota(ahora: Date): Date {
  const b = new Date(ahora.getTime() - 5 * 3_600_000);
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), 5));
}
export function inicioMesBogota(ahora: Date): Date {
  const b = new Date(ahora.getTime() - 5 * 3_600_000);
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 1, 5));
}

/**
 * Modo inteligente de modelos para imagen y video (Hernán, 28-oct): escoge el modelo de mejor costo-beneficio del nivel
 * pedido con el precio vivo del catálogo de OpenRouter, verifica los topes de costo (por pedido, por día y por mes,
 * ajustables en `settings.ia`) ANTES de gastar y deja cada generación registrada en `ia_usos`.
 */
@Injectable()
export class IaModelosService {
  private readonly logger = new Logger(IaModelosService.name);
  /** Las pruebas lo reemplazan. */
  http: typeof fetch = (url, init) => fetch(url, init);
  reloj: () => Date = () => new Date();
  private cacheVideo: { en: number; datos: ModeloVideoCatalogo[] } | null = null;
  private cacheImagen: { en: number; datos: ModeloImagenCatalogo[] } | null = null;

  constructor(
    @InjectRepository(IaUso) private readonly usos: Repository<IaUso>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly ctx: TenantContext,
  ) {}

  private clave(): string {
    const k = process.env.OPENROUTER_API_KEY;
    if (!k) throw new BadRequestException('OpenRouter no está configurado en este servidor: no se pueden generar imágenes ni videos.');
    return k;
  }

  private async json<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ status: number; data: T }> {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), init.timeoutMs ?? 30_000);
    try {
      const res = await this.http(url, { ...init, signal: c.signal, headers: { Authorization: `Bearer ${this.clave()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
      const texto = await res.text();
      let data: unknown = null;
      try {
        data = texto ? JSON.parse(texto) : null;
      } catch {
        data = { error: { message: texto.slice(0, 200) } };
      }
      return { status: res.status, data: data as T };
    } finally {
      clearTimeout(t);
    }
  }

  async catalogoVideo(): Promise<ModeloVideoCatalogo[]> {
    if (this.cacheVideo && Date.now() - this.cacheVideo.en < CACHE_MS) return this.cacheVideo.datos;
    const r = await this.json<{ data?: ModeloVideoCatalogo[] }>(`${BASE}/videos/models`);
    if (r.status !== 200 || !r.data?.data) throw new BadRequestException('No se pudo leer el catálogo de modelos de video de OpenRouter.');
    this.cacheVideo = { en: Date.now(), datos: r.data.data };
    return r.data.data;
  }

  async catalogoImagen(): Promise<ModeloImagenCatalogo[]> {
    if (this.cacheImagen && Date.now() - this.cacheImagen.en < CACHE_MS) return this.cacheImagen.datos;
    const r = await this.json<{ data?: ModeloImagenCatalogo[] }>(`${BASE}/models?output_modalities=image`);
    if (r.status !== 200 || !r.data?.data) throw new BadRequestException('No se pudo leer el catálogo de modelos de imagen de OpenRouter.');
    this.cacheImagen = { en: Date.now(), datos: r.data.data };
    return r.data.data;
  }

  async topes(): Promise<Topes> {
    const t = await this.tenants.findOne({ where: { id: this.ctx.tenantId } });
    return topesDe((t?.settings as Record<string, unknown> | undefined)?.ia);
  }

  /** Gasto de hoy y del mes (hora de Bogotá): lo real si ya terminó, lo estimado si sigue en proceso; lo fallido no cuenta. */
  async gasto(): Promise<GastoIa> {
    const ahora = this.reloj();
    const suma = async (desde: Date) => {
      const r = await this.usos
        .createQueryBuilder('u')
        .select('COALESCE(SUM(COALESCE(u.costo_real_usd, u.costo_estimado_usd)), 0)', 'total')
        .where("u.tenant_id = :t AND u.created_at >= :d AND u.estado <> 'fallido'", { t: this.ctx.tenantId, d: desde })
        .getRawOne<{ total: string }>();
      return Number(r?.total ?? 0);
    };
    const enProceso = await this.usos.count({ where: { tenantId: this.ctx.tenantId, estado: 'en_proceso' } });
    return { hoyUsd: await suma(inicioDiaBogota(ahora)), mesUsd: await suma(inicioMesBogota(ahora)), enProceso, topes: await this.topes() };
  }

  private async exigirTopes(estimadoUsd: number): Promise<GastoIa> {
    const g = await this.gasto();
    const v = verificarTopes(estimadoUsd, g.hoyUsd, g.mesUsd, g.topes);
    if (!v.ok) throw new ConflictException(`${v.motivo} Pide una versión más barata (más corta, nivel económico) o que un administrador suba el tope en los ajustes de IA.`);
    return g;
  }

  private nivelValido(n: unknown): NivelCalidad {
    return NIVELES.includes(n as NivelCalidad) ? (n as NivelCalidad) : 'economico';
  }

  private limpiarPrompt(p: unknown): string {
    const t = String(p ?? '').trim();
    if (t.length < 5) throw new BadRequestException('Describe lo que quieres generar (al menos una frase).');
    return t.slice(0, MAX_PROMPT);
  }

  /** Alternativas que MIA puede ofrecer: lo más barato de cada nivel para el mismo pedido. */
  async cotizarVideo(p: PedidoVideo): Promise<OpcionVideo[]> {
    const todas = opcionesVideo(await this.catalogoVideo(), { ...p, nivel: 'economico' });
    const porNivel = new Map<string, OpcionVideo>();
    for (const o of todas) if (!porNivel.has(o.nivel)) porNivel.set(o.nivel, o);
    return [...porNivel.values()];
  }

  async generarImagen(promptIn: unknown, nivelIn?: unknown): Promise<ImagenGenerada> {
    const prompt = this.limpiarPrompt(promptIn);
    const nivel = this.nivelValido(nivelIn);
    const opcion = elegirImagen(await this.catalogoImagen(), nivel);
    if (!opcion) throw new BadRequestException('No hay un modelo de imagen disponible para ese nivel en OpenRouter.');
    await this.exigirTopes(opcion.estimadoUsd);
    const uso = await this.registrar('imagen', opcion.modelo, opcion.nivel, opcion.estimadoUsd, prompt, {});
    try {
      const r = await this.json<{
        choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
        usage?: { cost?: number };
        error?: { message?: string };
      }>(`${BASE}/chat/completions`, { method: 'POST', timeoutMs: 120_000, body: JSON.stringify({ model: opcion.modelo, modalities: ['image', 'text'], messages: [{ role: 'user', content: prompt }] }) });
      const url = r.data?.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? '';
      const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(url);
      if (r.status !== 200 || !m) throw new Error(r.data?.error?.message ?? `OpenRouter no devolvió una imagen (HTTP ${r.status}).`);
      const costo = typeof r.data?.usage?.cost === 'number' ? r.data.usage.cost : opcion.estimadoUsd;
      await this.cerrar(uso.id, 'completado', costo, null);
      return { usoId: uso.id, modelo: opcion.modelo, nivel: opcion.nivel, costoUsd: costo, mime: m[1], buffer: Buffer.from(m[2], 'base64') };
    } catch (err) {
      await this.cerrar(uso.id, 'fallido', 0, (err as Error).message);
      throw new BadRequestException(`No se pudo generar la imagen: ${(err as Error).message}`);
    }
  }

  async generarVideo(promptIn: unknown, pedido: PedidoVideo): Promise<VideoIniciado> {
    const prompt = this.limpiarPrompt(promptIn);
    const nivel = this.nivelValido(pedido.nivel);
    const opcion = opcionesVideo(await this.catalogoVideo(), { ...pedido, nivel })[0];
    if (!opcion) throw new BadRequestException('Ningún modelo de video disponible cumple ese pedido (resolución, formato o audio). Prueba 720p, 16:9 y con audio.');
    const g = await this.exigirTopes(opcion.estimadoUsd);
    if (g.enProceso >= MAX_EN_PROCESO) throw new ConflictException(`Ya hay ${g.enProceso} videos en proceso: espera a que terminen antes de pedir otro.`);
    const uso = await this.registrar('video', opcion.modelo, opcion.nivel, opcion.estimadoUsd, prompt, { duracion: opcion.duracion, resolucion: opcion.resolucion, formato: opcion.formato, audio: opcion.audio });
    try {
      const r = await this.json<{ id?: string; error?: { message?: string } }>(`${BASE}/videos`, {
        method: 'POST',
        body: JSON.stringify({ model: opcion.modelo, prompt, duration: opcion.duracion, resolution: opcion.resolucion, aspect_ratio: opcion.formato, generate_audio: opcion.audio }),
      });
      if (r.status !== 202 || !r.data?.id) throw new Error(r.data?.error?.message ?? `OpenRouter no aceptó el pedido (HTTP ${r.status}).`);
      await this.usos.update({ id: uso.id, tenantId: this.ctx.tenantId }, { trabajoId: r.data.id });
      return { usoId: uso.id, modelo: opcion.modelo, nivel: opcion.nivel, estimadoUsd: opcion.estimadoUsd, duracion: opcion.duracion, resolucion: opcion.resolucion, audio: opcion.audio };
    } catch (err) {
      await this.cerrar(uso.id, 'fallido', 0, (err as Error).message);
      throw new BadRequestException(`No se pudo pedir el video: ${(err as Error).message}`);
    }
  }

  /** Estado de un video (el indicado o el último del usuario); si ya terminó, trae el archivo. */
  async estadoVideo(usoId?: string): Promise<EstadoVideo> {
    const uso = usoId
      ? await this.usos.findOne({ where: { id: usoId, tenantId: this.ctx.tenantId, tipo: 'video' } })
      : await this.usos.findOne({ where: { tenantId: this.ctx.tenantId, tipo: 'video', usuarioId: this.ctx.userId ?? undefined, estado: In(['en_proceso', 'completado']) }, order: { createdAt: 'DESC' } });
    if (!uso) throw new BadRequestException('No encuentro ningún video tuyo reciente.');
    if (uso.usuarioId && this.ctx.userId && uso.usuarioId !== this.ctx.userId) throw new BadRequestException('Ese video lo pidió otra persona.');
    if (uso.estado === 'fallido' || !uso.trabajoId) return { usoId: uso.id, estado: 'fallido', modelo: uso.modelo, costoUsd: 0, error: uso.error ?? 'El video no se pudo pedir.' };
    const r = await this.json<{ status?: string; usage?: { cost?: number }; error?: unknown }>(`${BASE}/videos/${encodeURIComponent(uso.trabajoId)}`);
    if (r.status !== 200) throw new BadRequestException(`No se pudo consultar el video (HTTP ${r.status}). Intenta de nuevo en un momento.`);
    const st = r.data?.status;
    if (st === 'failed') {
      const msg = typeof r.data?.error === 'string' ? r.data.error : JSON.stringify(r.data?.error ?? 'el proveedor no pudo generarlo');
      await this.cerrar(uso.id, 'fallido', 0, msg.slice(0, 400));
      return { usoId: uso.id, estado: 'fallido', modelo: uso.modelo, costoUsd: 0, error: msg.slice(0, 200) };
    }
    if (st !== 'completed') return { usoId: uso.id, estado: 'en_proceso', modelo: uso.modelo, costoUsd: null };
    const costo = typeof r.data?.usage?.cost === 'number' ? r.data.usage.cost : uso.costoEstimadoUsd;
    const archivo = await this.http(`${BASE}/videos/${encodeURIComponent(uso.trabajoId)}/content?index=0`, { headers: { Authorization: `Bearer ${this.clave()}` } });
    if (!archivo.ok) throw new BadRequestException(`El video está listo pero no se pudo descargar (HTTP ${archivo.status}). Intenta de nuevo.`);
    const buffer = Buffer.from(await archivo.arrayBuffer());
    if (uso.estado !== 'completado') await this.cerrar(uso.id, 'completado', costo, null);
    return { usoId: uso.id, estado: 'completado', modelo: uso.modelo, costoUsd: uso.estado === 'completado' ? (uso.costoRealUsd ?? costo) : costo, buffer };
  }

  private async registrar(tipo: TipoIa, modelo: string, nivel: string, estimadoUsd: number, prompt: string, detalle: Record<string, unknown>): Promise<IaUso> {
    return this.usos.save(
      this.usos.create({ tenantId: this.ctx.tenantId, usuarioId: this.ctx.userId ?? null, tipo, modelo, nivel, estado: 'en_proceso', costoEstimadoUsd: estimadoUsd, costoRealUsd: null, trabajoId: null, prompt, detalle, error: null, terminadoAt: null }),
    );
  }

  private async cerrar(id: string, estado: 'completado' | 'fallido', costoUsd: number, error: string | null): Promise<void> {
    await this.usos.update({ id, tenantId: this.ctx.tenantId }, { estado, costoRealUsd: costoUsd, error, terminadoAt: this.reloj() });
    if (estado === 'fallido') this.logger.warn(`Generación ${id} falló: ${error}`);
  }
}
