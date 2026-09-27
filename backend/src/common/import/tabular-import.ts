import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import * as XLSX from 'xlsx';

/**
 * Carga masiva desde la tabla que entregue el negocio (Excel .xlsx/.xls o
 * .csv, en base64) o desde filas JSON ya armadas. Pensado para "que cuando
 * nos den la información solo sea cargarla": las columnas se reconocen por
 * nombre, sin importar mayúsculas, tildes ni espacios.
 */
export class TabularImportDto {
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  // Sin esto, la conversión implícita del ValidationPipe global convierte cada fila en [].
  @Type(() => Object)
  rows?: Record<string, unknown>[];

  /** Archivo .xlsx / .xls / .csv en base64 (se lee la primera hoja). */
  @IsOptional()
  @IsString()
  @MaxLength(20_000_000)
  fileBase64?: string;

  @IsOptional()
  @IsString()
  filename?: string;

  /** true = solo valida y muestra qué haría; no escribe nada. */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export interface TabularImportResult<T> {
  dryRun: boolean;
  total: number;
  creados: number;
  actualizados: number;
  /** Todo o nada: si hay un solo error, no se escribe ninguna fila. */
  errores: Array<{ fila: number; error: string }>;
  filas: T[];
}

/** "Código Cliente" → "codigocliente". */
export function normalizeHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function readTabular(dto: TabularImportDto): Array<Record<string, string>> {
  let raw: Record<string, unknown>[];
  if (dto.rows?.length) {
    raw = dto.rows;
  } else if (dto.fileBase64) {
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(Buffer.from(dto.fileBase64, 'base64'), { type: 'buffer', raw: false });
    } catch (err) {
      throw new BadRequestException(`No se pudo leer el archivo${dto.filename ? ` "${dto.filename}"` : ''}: ${(err as Error).message}`);
    }
    const sheet = wb.SheetNames[0] ? wb.Sheets[wb.SheetNames[0]] : undefined;
    if (!sheet) throw new BadRequestException('El archivo no tiene ninguna hoja.');
    raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  } else {
    throw new BadRequestException('Envía "rows" (filas JSON) o "fileBase64" (Excel/CSV).');
  }
  if (raw.length === 0) throw new BadRequestException('La tabla no tiene filas.');
  if (raw.length > 5000) throw new BadRequestException('Máximo 5000 filas por carga.');
  return raw.map((r) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      out[normalizeHeader(k)] = v === null || v === undefined ? '' : String(v).trim();
    }
    return out;
  });
}

/** Primer valor no vacío entre varios nombres posibles de columna. */
export function pick(row: Record<string, string>, ...aliases: string[]): string {
  for (const a of aliases) {
    const v = row[normalizeHeader(a)];
    if (v) return v;
  }
  return '';
}

export function parseBool(v: string): boolean | null {
  if (!v) return null;
  const n = normalizeHeader(v);
  if (['si', 's', 'true', '1', 'x', 'yes', 'y'].includes(n)) return true;
  if (['no', 'n', 'false', '0'].includes(n)) return false;
  return null;
}

const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/** "Grupo.com; @otro.co" → ["grupo.com", "otro.co"]. Lanza si alguno no es un dominio. */
export function parseDomains(v: string | string[] | undefined): string[] {
  const list = (Array.isArray(v) ? v : (v ?? '').split(/[;,\s]+/))
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  for (const d of list) {
    if (!DOMAIN_RE.test(d)) throw new Error(`"${d}" no es un dominio de correo válido`);
  }
  return [...new Set(list)];
}
