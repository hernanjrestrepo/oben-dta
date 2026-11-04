import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { TransitTime } from '../../entities/transit-time.entity';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { normalizeHeader, type TabularImportDto, type TabularImportResult } from '../../common/import/tabular-import';
import { esHabil, festivosDe, restarDiasHabiles } from '../../common/calendario-colombia';
import { CreateTransitTimeDto, UpdateTransitTimeDto } from './dto/transit-time.dto';

const DUPLICATE_KEY_CODE = '23505';

/** Nombre sin tildes ni signos, en mayúsculas: "BOGOTÁ, D.C." → "BOGOTADC". */
export function claveTexto(t: unknown): string {
  return String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** Los nombres de incoterm que usa el archivo de Oben, a su sigla. */
export function incotermSigla(t: unknown): string {
  const s = String(t ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  const alias: Record<string, string> = { 'FREE ON BOARD': 'FOB', EXWORKS: 'EXW', 'EX WORKS': 'EXW', 'EX-WORKS': 'EXW' };
  return alias[s] ?? s;
}

/** El archivo de Oben llega con las tildes dañadas ("BOGOT?"): se restauran las que se conocen. */
const REPARACIONES: Array<[RegExp, string]> = [
  [/BOGOT�/gi, 'BOGOTÁ'],
  [/MEDELL�N/gi, 'MEDELLÍN'],
  [/C�CUTA/gi, 'CÚCUTA'],
  [/MONIQUIR�/gi, 'MONIQUIRÁ'],
  [/IBAGU�/gi, 'IBAGUÉ'],
  [/ESPA�A/gi, 'ESPAÑA'],
];

/** Nombre de país o puerto limpio: sin espacios ni guiones/puntos sobrantes al final ("MIAMI-", "HAMBURG."). */
export function limpiarNombre(t: unknown): string {
  let s = String(t ?? '').trim();
  for (const [re, ok] of REPARACIONES) s = s.replace(re, ok);
  return s.replace(/[\s\-.]+$/, '').trim();
}

export interface TransitImportRow {
  pais: string;
  puerto: string;
  incoterm: string;
  oceanDays: number;
  inlandDays: number;
  totalDays: number;
  accion: 'crear' | 'actualizar';
}

export interface DespachoCalculado {
  /** Fecha de despacho (AAAA-MM-DD), siempre día hábil; null si no hay tiempo de tránsito para ese destino. */
  fecha: string | null;
  tiempo: TransitTime | null;
  mensaje: string;
}

/**
 * Tiempos de tránsito (país / puerto destino / incoterm) administrables desde la plataforma y el cálculo de la fecha de
 * despacho: fecha de entrega menos los días HÁBILES de tránsito (lunes a viernes, sin festivos de Colombia).
 */
@Injectable()
export class TransitTimesService {
  constructor(
    @InjectRepository(TransitTime) private readonly repo: Repository<TransitTime>,
    private readonly ctx: TenantContext,
  ) {}

  list(): Promise<TransitTime[]> {
    return this.repo.find({ where: { tenantId: this.ctx.tenantId }, order: { pais: 'ASC', puerto: 'ASC', incoterm: 'ASC' } });
  }

  async create(dto: CreateTransitTimeDto): Promise<TransitTime> {
    const pais = limpiarNombre(dto.pais);
    const puerto = limpiarNombre(dto.puerto);
    const e = this.repo.create({
      tenantId: this.ctx.tenantId,
      pais,
      puerto,
      incoterm: incotermSigla(dto.incoterm),
      oceanDays: dto.oceanDays,
      inlandDays: dto.inlandDays,
      totalDays: dto.oceanDays + dto.inlandDays,
      paisClave: claveTexto(pais),
      puertoClave: claveTexto(puerto),
    });
    try {
      return await this.repo.save(e);
    } catch (err) {
      if ((err as { code?: string }).code === DUPLICATE_KEY_CODE) throw new ConflictException(`Ya existe un tiempo para ${e.pais} / ${e.puerto} / ${e.incoterm}. Edítalo en lugar de crear otro.`);
      throw err;
    }
  }

  async update(id: string, dto: UpdateTransitTimeDto): Promise<TransitTime> {
    const e = await this.findOne(id);
    if (dto.pais !== undefined) e.pais = limpiarNombre(dto.pais);
    if (dto.puerto !== undefined) e.puerto = limpiarNombre(dto.puerto);
    if (dto.incoterm !== undefined) e.incoterm = incotermSigla(dto.incoterm);
    if (dto.oceanDays !== undefined) e.oceanDays = dto.oceanDays;
    if (dto.inlandDays !== undefined) e.inlandDays = dto.inlandDays;
    e.totalDays = e.oceanDays + e.inlandDays;
    e.paisClave = claveTexto(e.pais);
    e.puertoClave = claveTexto(e.puerto);
    try {
      return await this.repo.save(e);
    } catch (err) {
      if ((err as { code?: string }).code === DUPLICATE_KEY_CODE) throw new ConflictException(`Ya existe un tiempo para ${e.pais} / ${e.puerto} / ${e.incoterm}.`);
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    await this.repo.remove(await this.findOne(id));
  }

  private async findOne(id: string): Promise<TransitTime> {
    const e = await this.repo.findOne({ where: { id, tenantId: this.ctx.tenantId } });
    if (!e) throw new NotFoundException('Tiempo de tránsito no encontrado.');
    return e;
  }

  /** El tiempo de ese país / puerto / incoterm (sin importar tildes, signos ni mayúsculas). */
  async buscar(p: { pais?: string; puerto?: string; incoterm?: string }): Promise<TransitTime | null> {
    const puertoClave = claveTexto(p.puerto);
    if (!puertoClave || !p.incoterm) return null;
    const hits = await this.repo.find({ where: { tenantId: this.ctx.tenantId, puertoClave, incoterm: incotermSigla(p.incoterm) } });
    if (hits.length <= 1) return hits[0] ?? null;
    const paisClave = claveTexto(p.pais);
    return hits.find((h) => h.paisClave === paisClave) ?? null;
  }

  /** Fecha de despacho = entrega − días hábiles de tránsito (lunes a viernes, sin festivos de Colombia). */
  async despacho(entrega: string, p: { pais?: string; puerto?: string; incoterm?: string }): Promise<DespachoCalculado> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entrega ?? '')) throw new BadRequestException('La fecha de entrega debe ser AAAA-MM-DD.');
    const tiempo = await this.buscar(p);
    if (!tiempo) {
      return { fecha: null, tiempo: null, mensaje: `No hay tiempo de tránsito cargado para ${p.puerto ?? '(puerto)'} con ${p.incoterm ?? '(incoterm)'}.` };
    }
    const fecha = restarDiasHabiles(entrega, tiempo.totalDays);
    return {
      fecha,
      tiempo,
      mensaje: `Despacho ${fecha}: entrega ${entrega} menos ${tiempo.totalDays} día(s) hábil(es) de tránsito a ${tiempo.puerto} (${tiempo.incoterm}); sin sábados, domingos ni festivos de Colombia.`,
    };
  }

  festivos(anio: number) {
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw new BadRequestException('Año no válido (2000 a 2100).');
    return festivosDe(anio).map((f) => ({ ...f, habil: esHabil(f.fecha) }));
  }

  /**
   * Carga masiva desde "LISTA TRANSITOS.xlsx" (o CSV): busca la fila de encabezados (PAIS, PUERTO DESTINO, INCONTERM,
   * OCEAN, INLAND, TOTAL) aunque el archivo traiga títulos arriba. Crea o actualiza por país+puerto+incoterm.
   */
  async importTransitos(dto: TabularImportDto): Promise<TabularImportResult<TransitImportRow>> {
    const filas = this.leerFilas(dto);
    const tenantId = this.ctx.tenantId;
    const errores: Array<{ fila: number; error: string }> = [];
    const porClave = new Map<string, TransitImportRow>();
    for (const f of filas) {
      try {
        const pais = limpiarNombre(f.pais);
        const puerto = limpiarNombre(f.puerto);
        const incoterm = incotermSigla(f.incoterm);
        if (!pais || !puerto || !incoterm) throw new Error('faltan país, puerto o incoterm');
        if (/�/.test(pais + puerto)) throw new Error(`el nombre "${pais} / ${puerto}" trae una tilde dañada del Excel: corrígelo en el archivo`);
        const ocean = this.dias(f.ocean, 'OCEAN');
        const inland = this.dias(f.inland, 'INLAND');
        const total = f.total === '' ? ocean + inland : this.dias(f.total, 'TOTAL');
        if (total !== ocean + inland) throw new Error(`TOTAL (${total}) no es OCEAN + INLAND (${ocean + inland})`);
        const k = `${claveTexto(pais)}|${claveTexto(puerto)}|${incoterm}`;
        const previo = porClave.get(k);
        // Repetido en el archivo: se queda el tiempo más largo (el conservador).
        if (previo && previo.totalDays >= total) continue;
        porClave.set(k, { pais, puerto, incoterm, oceanDays: ocean, inlandDays: inland, totalDays: total, accion: 'crear' });
      } catch (err) {
        errores.push({ fila: f.fila, error: (err as Error).message });
      }
    }
    const existentes = await this.repo.find({ where: { tenantId } });
    const porExistente = new Map(existentes.map((e) => [`${e.paisClave}|${e.puertoClave}|${e.incoterm}`, e]));
    const out: TransitImportRow[] = [];
    for (const [k, r] of porClave) {
      r.accion = porExistente.has(k) ? 'actualizar' : 'crear';
      out.push(r);
    }
    const dryRun = !!dto.dryRun;
    if (!dryRun && errores.length === 0) {
      for (const [k, r] of porClave) {
        const e = porExistente.get(k) ?? this.repo.create({ tenantId });
        Object.assign(e, {
          pais: r.pais,
          puerto: r.puerto,
          incoterm: r.incoterm,
          oceanDays: r.oceanDays,
          inlandDays: r.inlandDays,
          totalDays: r.totalDays,
          paisClave: claveTexto(r.pais),
          puertoClave: claveTexto(r.puerto),
        });
        await this.repo.save(e);
      }
    }
    return {
      dryRun,
      total: out.length,
      creados: out.filter((r) => r.accion === 'crear').length,
      actualizados: out.filter((r) => r.accion === 'actualizar').length,
      errores,
      filas: out,
    };
  }

  private dias(v: string, nombre: string): number {
    const n = Number(String(v).trim().replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) throw new Error(`${nombre} debe ser un número entero de días (llegó "${v}")`);
    return n;
  }

  private leerFilas(dto: TabularImportDto): Array<{ fila: number; pais: string; puerto: string; incoterm: string; ocean: string; inland: string; total: string }> {
    let matriz: unknown[][];
    if (dto.rows?.length) {
      matriz = [Object.keys(dto.rows[0]), ...dto.rows.map((r) => Object.values(r))];
    } else if (dto.fileBase64) {
      let wb: XLSX.WorkBook;
      try {
        wb = XLSX.read(Buffer.from(dto.fileBase64, 'base64'), { type: 'buffer', raw: false });
      } catch (err) {
        throw new BadRequestException(`No se pudo leer el archivo${dto.filename ? ` "${dto.filename}"` : ''}: ${(err as Error).message}`);
      }
      const hoja = wb.SheetNames[0] ? wb.Sheets[wb.SheetNames[0]] : undefined;
      if (!hoja) throw new BadRequestException('El archivo no tiene ninguna hoja.');
      matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: '', raw: false });
    } else {
      throw new BadRequestException('Envía "rows" (filas JSON) o "fileBase64" (Excel/CSV).');
    }
    const cab = matriz.findIndex((r) => r.some((c) => normalizeHeader(String(c)) === 'pais') && r.some((c) => normalizeHeader(String(c)).startsWith('puerto')));
    if (cab < 0) throw new BadRequestException('No encontré la fila de encabezados: debe tener PAIS, PUERTO DESTINO, INCONTERM, OCEAN (DIAS), INLAND (DIAS) y TOTAL (DIAS).');
    const nombres = matriz[cab].map((c) => normalizeHeader(String(c)));
    const col = (...opts: string[]) => nombres.findIndex((n) => opts.some((o) => n === o || n.startsWith(o)));
    const iPais = col('pais');
    const iPuerto = col('puerto');
    const iInc = col('incoterm', 'inconterm');
    const iOcean = col('ocean');
    const iInland = col('inland');
    const iTotal = col('total');
    if ([iPais, iPuerto, iInc, iOcean, iInland].some((i) => i < 0)) throw new BadRequestException('Faltan columnas: PAIS, PUERTO DESTINO, INCONTERM, OCEAN (DIAS) e INLAND (DIAS).');
    const txt = (r: unknown[], i: number) => (i < 0 || r[i] === undefined || r[i] === null ? '' : String(r[i]).trim());
    const out: Array<{ fila: number; pais: string; puerto: string; incoterm: string; ocean: string; inland: string; total: string }> = [];
    for (let i = cab + 1; i < matriz.length; i++) {
      const r = matriz[i];
      if (!txt(r, iPais) && !txt(r, iPuerto)) continue;
      out.push({ fila: i + 1, pais: txt(r, iPais), puerto: txt(r, iPuerto), incoterm: txt(r, iInc), ocean: txt(r, iOcean), inland: txt(r, iInland), total: txt(r, iTotal) });
    }
    if (out.length === 0) throw new BadRequestException('La tabla no tiene filas.');
    if (out.length > 2000) throw new BadRequestException('Máximo 2000 filas por carga.');
    return out;
  }
}
