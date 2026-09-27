import type { EjemploOc, OcIaConfig } from './oc-extractor';

/**
 * Configuración del flujo Comercial por tenant (`tenant.settings.comercial`).
 * Los valores por defecto salen de la reunión del 2026-09-23 y se reportan
 * como "por defecto" hasta que Customer Service (Alejandra) los confirme.
 */
export interface SeguimientoConfig {
  /** Horas entre recordatorios, en orden (ej. [24, 24, 24]). */
  intervalosHoras: number[];
  /** Después de agotar `intervalosHoras`, cada cuántas horas (null = no más recordatorios). */
  luegoCadaHoras: number | null;
}

export interface ComercialConfig {
  /** El buzón de pedidos alimenta este flujo (órdenes de compra y respuestas de clientes). */
  habilitado: boolean;
  /**
   * 'supervisado' = "freno de mano puesto" (Hernán, 47:16): cada escritura en
   * OBEN MAS espera la confirmación de una persona. 'automatico' = sin freno.
   */
  modo: 'supervisado' | 'automatico';
  /** Recordatorios al cliente mientras no firma/confirma la Proforma. */
  seguimientoFirma: SeguimientoConfig;
  /** Seguimiento al comercial mientras cartera no libera la orden. */
  seguimientoCartera: SeguimientoConfig;
  /** Lectura de la orden de compra: reglas (siempre disponible) o IA local (Ollama). */
  extractor: { provider: 'reglas' } | ({ provider: 'ollama' } & OcIaConfig);
  /** Ejemplos reales "OC como la manda el cliente → como la traducimos" (compromiso de Alejandra). */
  ejemplosOc: EjemploOc[];
}

/** Hernán (18:11): "los primeros 3 cada 24 horas, después se lo vamos espaciando". */
const SEGUIMIENTO_POR_DEFECTO: SeguimientoConfig = { intervalosHoras: [24, 24, 24], luegoCadaHoras: 168 };

export const COMERCIAL_POR_DEFECTO: ComercialConfig = {
  habilitado: false,
  modo: 'supervisado',
  seguimientoFirma: SEGUIMIENTO_POR_DEFECTO,
  seguimientoCartera: SEGUIMIENTO_POR_DEFECTO,
  extractor: { provider: 'reglas' },
  ejemplosOc: [],
};

export interface ConfigLeida {
  config: ComercialConfig;
  /** Campos que usan el valor por defecto (propuesta de la reunión, sin confirmar por Customer Service). */
  porDefecto: string[];
}

export function leerConfig(settings: Record<string, unknown> | null | undefined): ConfigLeida {
  const raw = ((settings ?? {}).comercial ?? {}) as Record<string, unknown>;
  const porDefecto: string[] = [];
  const has = (k: string) => raw[k] !== undefined && raw[k] !== null;

  const modo = raw.modo === 'automatico' || raw.modo === 'supervisado' ? raw.modo : null;
  if (!modo) porDefecto.push('modo');

  const seg = (k: 'seguimientoFirma' | 'seguimientoCartera'): SeguimientoConfig => {
    const s = has(k) ? parseSeguimiento(raw[k]) : null;
    if (!s) porDefecto.push(k);
    return s ?? SEGUIMIENTO_POR_DEFECTO;
  };

  let extractor: ComercialConfig['extractor'] = { provider: 'reglas' };
  const ex = raw.extractor as Record<string, unknown> | undefined;
  if (ex?.provider === 'ollama' && typeof ex.host === 'string' && typeof ex.model === 'string') {
    extractor = { provider: 'ollama', host: ex.host, model: ex.model, ...(typeof ex.timeoutMs === 'number' ? { timeoutMs: ex.timeoutMs } : {}) };
  }

  const ejemplosOc = Array.isArray(raw.ejemplosOc)
    ? (raw.ejemplosOc as unknown[]).filter(
        (e): e is EjemploOc => !!e && typeof e === 'object' && typeof (e as EjemploOc).entrada === 'string',
      )
    : [];
  if (ejemplosOc.length === 0) porDefecto.push('ejemplosOc');

  return {
    config: {
      habilitado: raw.habilitado === true,
      modo: modo ?? COMERCIAL_POR_DEFECTO.modo,
      seguimientoFirma: seg('seguimientoFirma'),
      seguimientoCartera: seg('seguimientoCartera'),
      extractor,
      ejemplosOc,
    },
    porDefecto,
  };
}

export function parseSeguimiento(v: unknown): SeguimientoConfig | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const intervalos = Array.isArray(o.intervalosHoras) ? o.intervalosHoras : null;
  if (!intervalos || intervalos.some((h) => typeof h !== 'number' || !(h > 0) || h > 24 * 90)) return null;
  const luego = o.luegoCadaHoras;
  if (luego !== null && luego !== undefined && (typeof luego !== 'number' || !(luego > 0) || luego > 24 * 90)) return null;
  return { intervalosHoras: intervalos as number[], luegoCadaHoras: (luego as number | null | undefined) ?? null };
}

/** Horas hasta el próximo recordatorio después de `enviados` recordatorios (null = no más). */
export function horasHastaSiguiente(s: SeguimientoConfig, enviados: number): number | null {
  if (enviados < s.intervalosHoras.length) return s.intervalosHoras[enviados];
  return s.luegoCadaHoras;
}
