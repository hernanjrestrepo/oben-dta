import { Injectable, Logger } from '@nestjs/common';

/** TRM oficial (Superintendencia Financiera) publicada en datos.gov.co — la misma que imprime Facture (3341.23 el 2026-09-30). */
const TRM_URL = 'https://www.datos.gov.co/resource/32sa-8pi3.json';

export interface Trm {
  valor: number;
  /** Día de vigencia (YYYY-MM-DD). */
  fecha: string;
}

/** Consulta la TRM vigente para una fecha; sin red o sin dato devuelve null (la factura la deja en blanco). */
@Injectable()
export class TrmService {
  private readonly logger = new Logger(TrmService.name);
  private readonly cache = new Map<string, Trm>();

  async vigente(fecha: string): Promise<Trm | null> {
    const enCache = this.cache.get(fecha);
    if (enCache) return enCache;
    const q = new URLSearchParams({ $where: `vigenciadesde <= '${fecha}T00:00:00.000'`, $order: 'vigenciadesde DESC', $limit: '1' });
    try {
      const res = await fetch(`${TRM_URL}?${q}`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const filas = (await res.json()) as Array<{ valor?: string; vigenciadesde?: string }>;
      const valor = Number(filas[0]?.valor);
      if (!Number.isFinite(valor) || valor <= 0) return null;
      const trm = { valor, fecha: String(filas[0].vigenciadesde ?? fecha).slice(0, 10) };
      this.cache.set(fecha, trm);
      return trm;
    } catch (err) {
      this.logger.warn(`No se pudo consultar la TRM del ${fecha}: ${(err as Error).message}`);
      return null;
    }
  }
}
