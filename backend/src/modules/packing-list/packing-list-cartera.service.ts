import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../entities/tenant.entity';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { OBEN_QUERY_OPTIONS } from '../oben-reports/oben-reports.service';

export type CarteraDecision =
  /** Se genera la Lista de Empaque. `verificada:false` = no se pudo confirmar con una fuente REAL. */
  | { action: 'continuar'; verificada: boolean; simulated: boolean; motivo: string }
  /** Cartera NO ha liberado (PND): no se genera; se re-verifica cada 6 horas. */
  | { action: 'retener'; pnd: boolean; simulated: boolean; motivo: string; observacion: string | null }
  /** La fuente real de cartera no respondió: no se genera todavía; se re-verifica pronto. */
  | { action: 'reintentar'; simulated: boolean; motivo: string };

/**
 * Regla PND — "Producir No Despachar" (reunión Comercial 2026-09-23, José,
 * 41:00–43:05): una orden puede estar activa en OBEN MAS (se produce todo)
 * mientras cartera todavía no la libera en NetSuite. Cuando llega el correo
 * "OV Aprobada En Corte" de una orden así, la Lista de Empaque NO se debe
 * generar — sin lista no hay predespacho — hasta que cartera libere.
 *
 * Fuente: `obenPlus` → `ov.cartera` (el SP que pediremos a Oben; hoy
 * simulado). Candado — un dato simulado NUNCA decide sobre documentos reales:
 * si la fuente de cartera es simulada pero los documentos salen del sistema
 * real de Oben (`obenCostOrder` real, como en producción hoy), la orden sigue
 * como siempre y queda auditado que cartera no se verificó. Solo en un
 * entorno 100 % simulado se retiene con datos simulados.
 *
 * Interruptor de emergencia: `tenant.settings.packingList.verificarCartera =
 * false` desactiva la verificación (p. ej. si la API real de cartera se cae
 * por días y Oben decide despachar igual).
 */
@Injectable()
export class PackingListCarteraService {
  constructor(
    private readonly hub: IntegrationHubService,
    private readonly ctx: TenantContext,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
  ) {}

  async evaluar(numberOrderSales: number): Promise<CarteraDecision> {
    const tenant = await this.tenants.findOne({ where: { id: this.ctx.tenantId } });
    const settings = (tenant?.settings ?? {}) as { packingList?: { verificarCartera?: unknown } };
    if (settings.packingList?.verificarCartera === false) {
      return {
        action: 'continuar',
        verificada: false,
        simulated: false,
        motivo: 'La verificación de cartera está desactivada por configuración (settings.packingList.verificarCartera=false).',
      };
    }

    const res = await this.hub.call<Record<string, unknown>>('obenPlus', 'ov.cartera', { numberOrderSales }, OBEN_QUERY_OPTIONS);
    const simulated = res.mode === 'mock' || res.data?.simulated === true;

    if (simulated && (await this.hub.capabilities('obenCostOrder')).mode !== 'mock') {
      return {
        action: 'continuar',
        verificada: false,
        simulated: true,
        motivo:
          'Cartera NO verificada: la fuente de cartera de OBEN MAS todavía es SIMULADA y los documentos son reales — un dato simulado no retiene ni libera una orden real. Pendiente del SP de cartera de Oben.',
      };
    }

    if (!res.ok) {
      return { action: 'reintentar', simulated, motivo: `No se pudo consultar cartera en OBEN MAS: ${res.error ?? 'error desconocido'}` };
    }
    const liberada = res.data?.liberada;
    if (typeof liberada !== 'boolean') {
      return { action: 'reintentar', simulated, motivo: 'OBEN MAS respondió sin el campo "liberada" de cartera.' };
    }
    if (liberada) {
      return { action: 'continuar', verificada: !simulated, simulated, motivo: 'Cartera liberada.' };
    }
    const observacion = typeof res.data?.observacion === 'string' ? res.data.observacion : null;
    return {
      action: 'retener',
      pnd: res.data?.pnd === true,
      simulated,
      observacion,
      motivo: 'Cartera no ha liberado la orden (PND — Producir No Despachar): la Lista de Empaque no se genera todavía.',
    };
  }
}
