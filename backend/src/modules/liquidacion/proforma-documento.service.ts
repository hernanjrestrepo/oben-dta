import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { ProformaCopia } from '../../entities/proforma-copia.entity';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { unwrapCheckSettlement } from './check-settlement-respuesta';
import { SP_PROFORMAS_COMEX, parsearProformasComex } from './incoterm-de-oben';
import { EmpaqueOv, ProformaDocumento, armarProformaDocumento } from './proforma-documento';

const OPCIONES = { maxAttempts: 1, timeoutMs: 30_000 };
const CACHE_CLIENTES_MS = 60 * 60_000;

const txt = (v: unknown) => String(v ?? '').trim();

/**
 * Reúne de Oben todo lo que hay de una proforma para mostrarla como la imprime OBEN MAS (María Escobar, 28-oct).
 * Solo lectura. Cada vez que spCheckSettlement responde se guarda una copia, porque Oben deja de entregarla al liquidarse.
 */
@Injectable()
export class ProformaDocumentoService {
  private readonly logger = new Logger(ProformaDocumentoService.name);
  private clientes: { en: number; filas: Array<Record<string, unknown>> } | null = null;

  constructor(
    private readonly hub: IntegrationHubService,
    private readonly ctx: TenantContext,
    @InjectRepository(ProformaCopia) private readonly copias: Repository<ProformaCopia>,
  ) {}

  private parsePF(raw: string): string {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) throw new BadRequestException('numberPF debe ser un número de Proforma válido');
    return String(n);
  }

  /** Guarda (o actualiza) la copia de la proforma tal como la entregó Oben. Nunca tumba la consulta. */
  async guardarCopia(pf: string, check: { OrdenVenta?: unknown; Detalle?: unknown } & Record<string, unknown>): Promise<void> {
    try {
      const { Detalle, ...campos } = check;
      if (!Array.isArray(Detalle) || Detalle.length === 0) return;
      const tenantId = this.ctx.tenantId;
      const ordenVenta = txt(check.OrdenVenta) || null;
      const existente = await this.copias.findOne({ where: { tenantId, numberPF: pf } });
      if (existente) {
        existente.campos = campos;
        existente.detalle = Detalle as Array<Record<string, unknown>>;
        existente.ordenVenta = ordenVenta;
        existente.capturadaAt = new Date();
        await this.copias.save(existente);
      }
      else await this.copias.save(this.copias.create({ tenantId, numberPF: pf, ordenVenta, campos, detalle: Detalle as Array<Record<string, unknown>>, capturadaAt: new Date() }));
    } catch (err) {
      this.logger.warn(`PF ${pf}: no se pudo guardar la copia de la proforma: ${(err as Error).message}`);
    }
  }

  private async checkVivo(pf: string): Promise<(Record<string, unknown> & { Detalle: Array<Record<string, unknown>> }) | null> {
    try {
      const res = await this.hub.call<unknown>('obenCostOrder', 'liquidacion.consultar', { numberPF: pf }, OPCIONES);
      if (!res.ok) return null;
      const d = unwrapCheckSettlement(res.data, pf) as (Record<string, unknown> & { Detalle?: unknown }) | null | undefined;
      if (!d || typeof d !== 'object' || !Array.isArray(d.Detalle) || d.Detalle.length === 0) return null;
      return d as Record<string, unknown> & { Detalle: Array<Record<string, unknown>> };
    } catch {
      return null;
    }
  }

  private async filaReporte(pf: string): Promise<Record<string, unknown> | null> {
    for (const target of [undefined, 'liquidacion'] as const) {
      try {
        const res = await this.hub.call<unknown>('obenCostOrder', 'query.run', { procedure: SP_PROFORMAS_COMEX, numberOrderSales: pf, ...(target ? { target } : {}) }, OPCIONES);
        if (!res.ok) continue;
        const fila = parsearProformasComex(res.data).find((r) => txt(r.NroProforma ?? r.Proforma) === pf);
        if (fila) return fila;
      } catch {
        /* se prueba el siguiente servidor */
      }
    }
    return null;
  }

  private async empaqueDe(ovs: number[]): Promise<EmpaqueOv[]> {
    const salida: EmpaqueOv[] = [];
    for (const ov of ovs) {
      try {
        const res = await this.hub.call<unknown>('obenCostOrder', 'query.run', { procedure: 'spEmpaqueUnificada_Paradixe', numberOrderSales: ov }, OPCIONES);
        const h = res.ok ? (Array.isArray(res.data) ? (res.data as unknown[])[0] : res.data) : null;
        if (!h || typeof h !== 'object') continue;
        const o = h as Record<string, unknown>;
        const porSku = new Map<string, { rollos: number; kilosNetos: number }>();
        for (const d of Array.isArray(o.Detalle) ? (o.Detalle as Array<Record<string, unknown>>) : []) {
          const sku = txt(d.CodigoMaterial);
          if (!sku) continue;
          const previo = porSku.get(sku) ?? { rollos: 0, kilosNetos: 0 };
          porSku.set(sku, { rollos: previo.rollos + (Number(d.Bobinas) || 0), kilosNetos: previo.kilosNetos + (Number(d.PesoNetoKg) || 0) });
        }
        salida.push({
          ov,
          cliente: txt(o.Cliente) || null,
          ordenCompra: txt(o.OrdenCompra) || null,
          contenedor: txt(o.Contenedor) || null,
          pais: txt(o.Pais) || null,
          pallets: Number(o.TotalPallet) || null,
          skus: [...porSku.entries()].map(([sku, v]) => ({ sku, rollos: v.rollos, kilosNetos: Math.round(v.kilosNetos * 100) / 100 })),
        });
      } catch {
        /* la OV aún no tiene Lista de Empaque */
      }
    }
    return salida;
  }

  /** Dirección del cliente en el maestro de Oben, solo si el cliente tiene UN destino (con varios no se adivina cuál es). */
  private async direccionUnica(cliente: string | null): Promise<string | null> {
    if (!cliente) return null;
    try {
      if (!this.clientes || Date.now() - this.clientes.en > CACHE_CLIENTES_MS) {
        const r = await this.hub.call<unknown>('obenCostOrder', 'comercial.consultar', { maestro: 'clientes', parametros: {} }, { maxAttempts: 1, timeoutMs: 60_000 });
        if (!r.ok || !Array.isArray(r.data)) return null;
        this.clientes = { en: Date.now(), filas: r.data as Array<Record<string, unknown>> };
      }
      const filas = this.clientes.filas.filter((f) => txt(f.Nombre_Cliente ?? f.Target_Customer).toUpperCase() === cliente.toUpperCase());
      const direcciones = [...new Set(filas.map((f) => txt(f.Direccion_Destino).replace(/\s*\n\s*/g, ', ')).filter(Boolean))];
      return direcciones.length === 1 ? direcciones[0] : null;
    } catch {
      return null;
    }
  }

  async documento(numberPF: string): Promise<ProformaDocumento> {
    const pf = this.parsePF(numberPF);
    const vivo = await this.checkVivo(pf);
    if (vivo) await this.guardarCopia(pf, vivo);
    const copia = vivo ? null : await this.copias.findOne({ where: { tenantId: this.ctx.tenantId, numberPF: pf } });
    const check = vivo ? { campos: (({ Detalle: _d, ...c }) => c)(vivo), detalle: vivo.Detalle } : copia ? { campos: copia.campos, detalle: copia.detalle } : null;

    const reporte = await this.filaReporte(pf);
    const ovs = new Set<number>();
    for (const o of Array.isArray(reporte?.OrdenesVenta) ? (reporte!.OrdenesVenta as Array<Record<string, unknown>>) : []) if (Number(o.NroOrdenVenta) > 0) ovs.add(Number(o.NroOrdenVenta));
    for (const x of txt(check?.campos.OrdenVenta).split(/[\s,;/]+/)) if (Number(x) > 0) ovs.add(Number(x));
    if (!check && !reporte && ovs.size === 0) {
      throw new BadRequestException(`Oben no devolvió datos de la proforma ${pf}: ni la liquidación ni el reporte de proformas, y no hay copia guardada.`);
    }
    const empaque = await this.empaqueDe([...ovs]);
    const cliente = txt(check?.campos.Cliente) || txt(reporte?.Cliente) || empaque[0]?.cliente || null;
    const direccionCliente = check?.campos.Direccion ? null : await this.direccionUnica(cliente);
    return armarProformaDocumento({ numberPF: pf, check, copiaDe: copia ? copia.capturadaAt.toISOString() : null, reporte, empaque, direccionCliente });
  }
}
