import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FreightOceanRate } from '../../entities/freight-ocean-rate.entity';
import { FreightInlandRate } from '../../entities/freight-inland-rate.entity';
import { FreightRateCarga } from '../../entities/freight-rate-carga.entity';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import { leerTarifarioExportacion, type FilaInland, type FilaMaritima, type TarifarioLeido } from './tarifario-exportacion';

export interface CambioTarifa {
  tipo: 'maritima' | 'inland';
  ruta: string;
  proveedor: string;
  antes: number | null;
  despues: number | null;
  vigenteHasta: string | null;
}

export interface ResultadoCargaTarifario {
  archivo: string;
  /** false = solo vista previa (no se cambió nada). */
  aplicado: boolean;
  maritimas: { total: number; nuevas: number; cambiadas: number; iguales: number; quitadas: number; vencidas: number };
  inland: { total: number; nuevas: number; cambiadas: number; iguales: number; quitadas: number; vencidas: number };
  /** Las tarifas que cambian de valor, entran o salen (hasta 60, primero las cambiadas). */
  cambios: CambioTarifa[];
  descartadas: TarifarioLeido['descartadas'];
  avisos: string[];
  cargaId?: string;
}

const WORKFLOW = 'liquidacion';
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Clave de una tarifa marítima (sin el valor): si solo cambia el valor, la fila se actualiza y conserva su id. */
const claveMaritima = (m: Pick<FilaMaritima, 'origin' | 'destination' | 'containerType' | 'forwarder' | 'shippingLine' | 'transitPoints'>) =>
  [m.origin, m.destination, m.containerType, m.forwarder, m.shippingLine ?? '', m.transitPoints ?? ''].map((x) => String(x).trim().toUpperCase()).join('|');
const claveInland = (i: Pick<FilaInland, 'country' | 'forwarder' | 'destinationPort' | 'destinationAddress'>) =>
  [i.country, i.forwarder, i.destinationPort, i.destinationAddress].map((x) => String(x).trim().toUpperCase()).join('|');

/** Numera las claves repetidas en orden ("…#1", "…#2"): el archivo trae tarifas iguales por peso de contenedor. */
function conOcurrencia<T>(filas: T[], clave: (f: T) => string): Array<[string, T]> {
  const vistos = new Map<string, number>();
  return filas.map((f) => {
    const k = clave(f);
    const n = (vistos.get(k) ?? 0) + 1;
    vistos.set(k, n);
    return [`${k}#${n}`, f];
  });
}

/**
 * Carga del tarifario de fletes de exportación desde la pantalla (María, reunión del 20-oct: "descargo mi
 * tarifario y lo subo aquí para que lo actualice automáticamente", también para tarifas spot). Primero una
 * vista previa con lo que cambia; al confirmar, reemplaza las tarifas marítimas (pata 2) e Inland (pata 3) del
 * tenant en una sola transacción y guarda un respaldo completo de lo anterior. No toca los recargos de
 * destino (Entry Fee, ISF, HMF): el archivo no los trae.
 */
@Injectable()
export class TarifarioExportacionService {
  private readonly logger = new Logger(TarifarioExportacionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly ctx: TenantContext,
    @InjectRepository(FreightOceanRate) private readonly ocean: Repository<FreightOceanRate>,
    @InjectRepository(FreightInlandRate) private readonly inland: Repository<FreightInlandRate>,
    @InjectRepository(FreightRateCarga) private readonly cargas: Repository<FreightRateCarga>,
    @Optional() private readonly audit?: WorkflowAuditService,
  ) {}

  async cargar(buffer: Buffer, archivo: string, opciones: { confirmar: boolean; usuario: string | null }): Promise<ResultadoCargaTarifario> {
    let leido: TarifarioLeido;
    try {
      leido = leerTarifarioExportacion(buffer);
    } catch (err) {
      throw new BadRequestException(`No se pudo leer el tarifario: ${(err as Error).message}`);
    }
    const tenantId = this.ctx.tenantId;
    const hoy = new Date().toISOString().slice(0, 10);
    const [actualesM, actualesI] = await Promise.all([this.ocean.find({ where: { tenantId } }), this.inland.find({ where: { tenantId } })]);

    const nuevasM = conOcurrencia<FilaMaritima>(leido.maritimas, claveMaritima);
    const nuevasI = conOcurrencia<FilaInland>(leido.inland, claveInland);
    const viejasM = new Map(conOcurrencia<FreightOceanRate>(actualesM, (r) => claveMaritima(r)));
    const viejasI = new Map(conOcurrencia<FreightInlandRate>(actualesI, (r) => claveInland(r)));

    const cambios: CambioTarifa[] = [];
    const resumen = (tipo: 'maritima' | 'inland') => ({ total: 0, nuevas: 0, cambiadas: 0, iguales: 0, quitadas: 0, vencidas: 0, tipo });
    const rM = resumen('maritima');
    const rI = resumen('inland');
    const rutaM = (m: { origin: string; destination: string }) => `${m.origin.replace(/\s*\(.*$/, '')} → ${m.destination.replace(/\s*\(.*$/, '')}`;
    const rutaI = (i: { destinationPort: string; destinationAddress: string }) => `${i.destinationPort} → ${i.destinationAddress}`;

    for (const [k, m] of nuevasM) {
      rM.total++;
      if (m.validUntil && m.validUntil < hoy) rM.vencidas++;
      const v = viejasM.get(k);
      if (!v) {
        rM.nuevas++;
        cambios.push({ tipo: 'maritima', ruta: rutaM(m), proveedor: [m.forwarder, m.shippingLine].filter(Boolean).join(' / '), antes: null, despues: m.rateTotal, vigenteHasta: m.validUntil });
      } else if (round2(Number(v.rateTotal)) !== m.rateTotal) {
        rM.cambiadas++;
        cambios.push({ tipo: 'maritima', ruta: rutaM(m), proveedor: [m.forwarder, m.shippingLine].filter(Boolean).join(' / '), antes: round2(Number(v.rateTotal)), despues: m.rateTotal, vigenteHasta: m.validUntil });
      } else rM.iguales++;
    }
    const clavesM = new Set(nuevasM.map(([k]) => k));
    for (const [k, v] of viejasM) {
      if (clavesM.has(k)) continue;
      rM.quitadas++;
      cambios.push({ tipo: 'maritima', ruta: rutaM(v), proveedor: [v.forwarder, v.shippingLine].filter(Boolean).join(' / '), antes: round2(Number(v.rateTotal)), despues: null, vigenteHasta: v.validUntil });
    }
    for (const [k, i] of nuevasI) {
      rI.total++;
      if (i.validUntil && i.validUntil < hoy) rI.vencidas++;
      const v = viejasI.get(k);
      if (!v) {
        rI.nuevas++;
        cambios.push({ tipo: 'inland', ruta: rutaI(i), proveedor: i.forwarder, antes: null, despues: i.rate40hc, vigenteHasta: i.validUntil });
      } else if (round2(Number(v.rate40hc)) !== i.rate40hc) {
        rI.cambiadas++;
        cambios.push({ tipo: 'inland', ruta: rutaI(i), proveedor: i.forwarder, antes: round2(Number(v.rate40hc)), despues: i.rate40hc, vigenteHasta: i.validUntil });
      } else rI.iguales++;
    }
    const clavesI = new Set(nuevasI.map(([k]) => k));
    for (const [k, v] of viejasI) {
      if (clavesI.has(k)) continue;
      rI.quitadas++;
      cambios.push({ tipo: 'inland', ruta: rutaI(v), proveedor: v.forwarder, antes: round2(Number(v.rate40hc)), despues: null, vigenteHasta: v.validUntil });
    }
    const orden = (c: CambioTarifa) => (c.antes !== null && c.despues !== null ? 0 : c.despues === null ? 1 : 2);
    cambios.sort((a, b) => orden(a) - orden(b));

    const avisos: string[] = [];
    if (rM.vencidas || rI.vencidas) avisos.push(`${rM.vencidas} tarifas marítimas y ${rI.vencidas} Inland ya están vencidas: se cargan igual y la liquidación lo avisa al usarlas.`);
    if (rM.quitadas || rI.quitadas) avisos.push(`Salen ${rM.quitadas} tarifas marítimas y ${rI.quitadas} Inland que no están en el archivo. Si una liquidación abierta las tenía escogidas, vuelve a la sugerida (COMEX la puede escoger de nuevo).`);
    if (leido.descartadas.length) avisos.push(`${leido.descartadas.length} filas del archivo no se cargan (ver detalle).`);
    avisos.push('Los recargos de destino (Entry Fee 120, ISF 45, HMF) no cambian: el archivo no los trae.');

    const strip = (r: ReturnType<typeof resumen>) => ({ total: r.total, nuevas: r.nuevas, cambiadas: r.cambiadas, iguales: r.iguales, quitadas: r.quitadas, vencidas: r.vencidas });
    const base: ResultadoCargaTarifario = { archivo, aplicado: false, maritimas: strip(rM), inland: strip(rI), cambios: cambios.slice(0, 60), descartadas: leido.descartadas, avisos };
    if (!opciones.confirmar) return base;

    const fuenteM = `${archivo} (Leg2)`;
    const fuenteI = `${archivo} (Leg3)`;
    let cargaId = '';
    await this.dataSource.transaction(async (manager) => {
      const carga = await manager.save(
        manager.create(FreightRateCarga, {
          tenantId,
          archivo,
          contenido: buffer,
          tamano: buffer.length,
          resumen: { maritimas: base.maritimas, inland: base.inland, descartadas: leido.descartadas.length },
          tarifas: { maritimas: leido.maritimas, inland: leido.inland },
          respaldo: { maritimas: actualesM, inland: actualesI },
          usuarioId: this.ctx.userId ?? null,
          usuarioNombre: opciones.usuario,
        }),
      );
      cargaId = carga.id;
      // Marítimas: se actualiza en su lugar lo que sigue (conserva el id: las rutas escogidas por COMEX siguen valiendo).
      const idsM: string[] = [];
      for (const [k, m] of nuevasM) {
        const v = viejasM.get(k);
        const datos = { ...m, rateTotal: m.rateTotal, sourceFile: fuenteM, tenantId };
        if (v) {
          await manager.update(FreightOceanRate, { id: v.id, tenantId }, datos);
          idsM.push(v.id);
        } else {
          const nueva = await manager.save(manager.create(FreightOceanRate, datos));
          idsM.push(nueva.id);
        }
      }
      const quitarM = actualesM.filter((r) => !idsM.includes(r.id)).map((r) => r.id);
      if (quitarM.length) await manager.delete(FreightOceanRate, quitarM);
      const idsI: string[] = [];
      for (const [k, i] of nuevasI) {
        const v = viejasI.get(k);
        const datos = { ...i, customsCommission: i.customsCommission === null ? null : String(i.customsCommission), sourceFile: fuenteI, tenantId };
        if (v) {
          await manager.update(FreightInlandRate, { id: v.id, tenantId }, datos);
          idsI.push(v.id);
        } else {
          const nueva = await manager.save(manager.create(FreightInlandRate, datos));
          idsI.push(nueva.id);
        }
      }
      const quitarI = actualesI.filter((r) => !idsI.includes(r.id)).map((r) => r.id);
      if (quitarI.length) await manager.delete(FreightInlandRate, quitarI);
    });
    this.logger.log(`Tarifario cargado por ${opciones.usuario ?? 'desconocido'}: ${archivo} (${rM.total} marítimas, ${rI.total} Inland; carga ${cargaId}).`);
    await this.audit
      ?.log({
        workflowName: WORKFLOW,
        eventType: WorkflowEventType.ACTION_EXECUTED,
        action: 'tarifario_exportacion_cargado',
        entityType: 'tarifario',
        entityId: cargaId,
        actorId: this.ctx.userId,
        inputData: { archivo, usuario: opciones.usuario },
        outputData: { maritimas: base.maritimas, inland: base.inland, descartadas: leido.descartadas.length },
      })
      .catch(() => undefined);
    return { ...base, aplicado: true, cargaId };
  }

  /** Histórico de cuadros subidos, el más reciente primero (sin el contenido, que es pesado). */
  async historial(): Promise<Array<{ id: string; archivo: string; tamano: number | null; usuario: string | null; fecha: string; resumen: Record<string, unknown>; vigente: boolean }>> {
    const filas = await this.cargas.find({ where: { tenantId: this.ctx.tenantId }, order: { createdAt: 'DESC' }, take: 100 });
    return filas.map((f, i) => ({ id: f.id, archivo: f.archivo, tamano: f.tamano, usuario: f.usuarioNombre, fecha: new Date(f.createdAt).toISOString(), resumen: f.resumen, vigente: i === 0 }));
  }

  /** El Excel original de una carga del histórico. */
  async archivoDeCarga(id: string): Promise<{ archivo: string; contenido: Buffer }> {
    const f = await this.cargas.findOne({ where: { id, tenantId: this.ctx.tenantId }, select: { id: true, archivo: true, contenido: true } });
    if (!f?.contenido) throw new BadRequestException('Esa carga del tarifario no existe o no guardó el archivo.');
    return { archivo: f.archivo, contenido: f.contenido };
  }
}
