import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, ILike, In, LessThanOrEqual, MoreThanOrEqual, Repository, type FindOptionsWhere } from 'typeorm';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import { DistributionListsService } from '../distribution-lists/distribution-lists.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { ClientsService } from '../clients/clients.service';
import { EquivalencesService } from '../equivalences/equivalences.service';
import { OBEN_QUERY_OPTIONS } from '../oben-reports/oben-reports.service';
import { Tenant } from '../../entities/tenant.entity';
import {
  CASO_ESTADOS,
  CASO_ESTADOS_ABIERTOS,
  type AccionPendiente,
  type AccionPendienteTipo,
  type CasoEstado,
  type CasoLinea,
  ComercialCase,
} from '../../entities/comercial-case.entity';
import { ComercialIntakeService, DOMINIO_DEMO_RE, calcularMissing, faltantesLinea, type OcEntrada } from './comercial-intake.service';
import { horasHastaSiguiente, leerConfig, parseSeguimiento, type ComercialConfig, type ConfigLeida } from './comercial-config';
import { clasificarRespuesta, type TipoRespuesta } from './comercial-respuesta';
import { construirLinea, type OcAdjunto } from './oc-extractor';

const WORKFLOW = 'comercial';
const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
/** Cada cuánto se consulta OBEN MAS por un caso abierto. */
const POLL_MS: Partial<Record<CasoEstado, number>> = {
  sin_cubicar: 15 * MIN_MS,
  cubicada: 60 * MIN_MS,
  enviada_cliente: 15 * MIN_MS,
  retenida: 30 * MIN_MS,
  activa: 6 * HOUR_MS,
};
const MAX_EVENTOS = 200;

/** Listas de distribución del flujo Comercial. */
export const LISTA_CUSTOMER_SERVICE = 'comercial_customer_service';
/** Copia de la Proforma que se envía al cliente (Customer Service y, si se quiere, cartera — Alejandra, 10:29). */
export const LISTA_COPIA_PROFORMA = 'comercial_proforma_copia';
/** Cartera: recibe la Proforma aprobada por el cliente (hoy se la reenvían a mano). */
export const LISTA_CARTERA = 'comercial_cartera';

export const PROFORMA_PDF_SIMULADA_LABEL = 'PDF de la Proforma SIMULADO — NO es el documento oficial de OBEN MAS (pendiente de su API)';

export interface RespuestaCorreo {
  from: string;
  subject: string;
  body: string;
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  attachments?: OcAdjunto[];
}

export interface EditarCasoInput {
  lineas?: Array<Partial<Pick<CasoLinea, 'codigoOben' | 'kilos' | 'anchoMm' | 'espesorMicras' | 'precioUnitario' | 'moneda'>> & { n: number; guardarEquivalencia?: boolean }>;
  quitarLineas?: number[];
  direccionId?: string;
  direccionManual?: { direccion: string; ciudad?: string | null; pais: string };
  fechaRequerida?: string | null;
  clienteFinal?: string | null;
  ocNumero?: string | null;
}

export interface FiltrosCasos {
  estado?: string;
  cliente?: string;
  desde?: string;
  hasta?: string;
}

/**
 * Flujo Comercial de punta a punta (reunión Comercial 2026-09-23):
 *
 *   OC por correo → Proforma "sin cubicar" en OBEN MAS → Planeación cubica →
 *   PDF de la Proforma al cliente (copia al comercial) → recordatorios hasta
 *   que responda → aprueba (OV retenida, se reenvía a cartera) / rechaza
 *   (se anula) / modifica (vuelve a "sin cubicar") → seguimiento al
 *   comercial mientras cartera no libera → OV activa → seguimiento de la
 *   fecha de entrega hasta el despacho.
 *
 * Candados:
 *  - Datos simulados nunca se escriben en un OBEN MAS real ni un PDF
 *    simulado llega a un cliente real.
 *  - "Freno de mano" (modo supervisado, por defecto): cada escritura en OBEN
 *    MAS queda como acción pendiente hasta que una persona la confirma.
 *  - Cada escritura en OBEN MAS es idempotente: un reintento nunca crea dos
 *    Proformas; un timeout (ambiguo) exige verificar en OBEN MAS.
 *  - Solo se acepta una respuesta desde un dominio autorizado del cliente.
 */
@Injectable()
export class ComercialFlujoService {
  private readonly logger = new Logger(ComercialFlujoService.name);

  constructor(
    @InjectRepository(ComercialCase) private readonly casos: Repository<ComercialCase>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly intake: ComercialIntakeService,
    private readonly hub: IntegrationHubService,
    private readonly ctx: TenantContext,
    private readonly audit: WorkflowAuditService,
    private readonly distributionLists: DistributionListsService,
    private readonly idempotency: IdempotencyService,
    private readonly clients: ClientsService,
    private readonly equivalences: EquivalencesService,
  ) {}

  // ─── Configuración ───────────────────────────────────────────────────────

  async config(): Promise<ConfigLeida> {
    const tenant = await this.tenants.findOne({ where: { id: this.ctx.tenantId } });
    return leerConfig(tenant?.settings);
  }

  async actualizarConfig(cambios: Record<string, unknown>): Promise<ConfigLeida> {
    const tenant = await this.tenants.findOne({ where: { id: this.ctx.tenantId } });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    const actual = ((tenant.settings ?? {}).comercial ?? {}) as Record<string, unknown>;
    const nuevo: Record<string, unknown> = { ...actual };
    if (cambios.habilitado !== undefined) {
      if (typeof cambios.habilitado !== 'boolean') throw new BadRequestException('habilitado debe ser true/false');
      nuevo.habilitado = cambios.habilitado;
    }
    if (cambios.modo !== undefined) {
      if (cambios.modo !== 'supervisado' && cambios.modo !== 'automatico') throw new BadRequestException('modo: "supervisado" o "automatico"');
      nuevo.modo = cambios.modo;
    }
    for (const k of ['seguimientoFirma', 'seguimientoCartera'] as const) {
      if (cambios[k] !== undefined) {
        if (!parseSeguimiento(cambios[k])) {
          throw new BadRequestException(`${k}: { intervalosHoras: número[] (>0), luegoCadaHoras: número|null }`);
        }
        nuevo[k] = cambios[k];
      }
    }
    if (cambios.extractor !== undefined) {
      const ex = cambios.extractor as Record<string, unknown>;
      const ok =
        ex?.provider === 'reglas' || (ex?.provider === 'ollama' && typeof ex.host === 'string' && typeof ex.model === 'string');
      if (!ok) throw new BadRequestException('extractor: { provider: "reglas" } o { provider: "ollama", host, model }');
      nuevo.extractor = cambios.extractor;
    }
    if (cambios.ejemplosOc !== undefined) {
      if (!Array.isArray(cambios.ejemplosOc) || cambios.ejemplosOc.some((e) => typeof (e as { entrada?: unknown })?.entrada !== 'string')) {
        throw new BadRequestException('ejemplosOc: [{ entrada: string, salida: {...} }]');
      }
      nuevo.ejemplosOc = cambios.ejemplosOc;
    }
    tenant.settings = { ...(tenant.settings ?? {}), comercial: nuevo };
    await this.tenants.save(tenant);
    await this.audit.log({
      workflowName: WORKFLOW,
      action: 'comercial_configuracion_actualizada',
      entityType: 'tenant',
      entityId: this.ctx.tenantId,
      actorId: this.ctx.userId,
      inputData: cambios,
    });
    return leerConfig(tenant.settings);
  }

  // ─── Orden de compra ─────────────────────────────────────────────────────

  async recibirOc(input: OcEntrada, origen: 'correo' | 'manual'): Promise<ComercialCase> {
    if (input.messageId) {
      const dup = await this.casos.findOne({ where: { tenantId: this.ctx.tenantId, ocMessageId: input.messageId } });
      if (dup) return dup;
    }
    const { config } = await this.config();
    const data = await this.intake.construir(input, config);
    let caso = this.casos.create({
      ...data,
      tenantId: this.ctx.tenantId,
      estado: 'oc_recibida',
      fechas: { ocRecibida: (data.ocRecibidaEn ?? new Date()).toISOString() },
      eventos: [],
      hiloMessageIds: [],
      seguimiento: { tipo: null, enviados: 0, proximoEn: null, ultimoEn: null },
      nextCheckAt: null,
      accionPendiente: null,
      numberPF: null,
      numberOrderSales: null,
      entregaComprometida: null,
      entregaHistorial: [],
      proformaFirmadaNombre: null,
    });
    this.evento(caso, 'oc_recibida', `Orden de compra ${caso.ocNumero ?? '(sin número)'} recibida por ${origen} de ${caso.contactoEmail} (${caso.lineas?.length ?? 0} línea(s), leída por ${caso.extraidoPor}).`);
    caso = await this.casos.save(caso);
    await this.audit.log({
      workflowName: WORKFLOW,
      eventType: WorkflowEventType.WORKFLOW_STARTED,
      action: 'comercial_oc_recibida',
      entityType: 'comercial_case',
      entityId: caso.id,
      actorId: this.ctx.userId,
      outputData: { cliente: caso.cliente, ocNumero: caso.ocNumero, lineas: caso.lineas.length, missing: caso.missing, simulated: caso.simulated, origen },
    });
    if (!caso.clientId) {
      await this.avisarCS(caso, `Orden de compra de un remitente no autorizado (${caso.contactoEmail})`, caso.atencion.join(' '));
      return caso;
    }
    return this.avanzarOc(caso);
  }

  /** OC completa → acción "crear Proforma" (con freno de mano) ; incompleta → espera correcciones. */
  private async avanzarOc(caso: ComercialCase): Promise<ComercialCase> {
    if (caso.estado !== 'oc_recibida') return caso;
    if (caso.missing.length > 0) {
      await this.avisarCS(
        caso,
        `Orden de compra ${caso.ocNumero ?? ''} de ${caso.cliente ?? caso.contactoEmail}: faltan datos para crear la Proforma`,
        `<p>Faltan datos (no se rellenan con supuestos):</p><ul>${caso.missing.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`,
      );
      return caso;
    }
    return this.solicitarAccion(caso, { tipo: 'crear_proforma', detalle: `Crear la Proforma en OBEN MAS con ${caso.lineas.length} línea(s).` });
  }

  async editar(id: string, dto: EditarCasoInput): Promise<ComercialCase> {
    const caso = await this.obtener(id);
    if (caso.estado !== 'oc_recibida') {
      throw new BadRequestException(`El caso está "${caso.estado}": la Proforma ya existe — para cambiar cantidades registra una modificación.`);
    }
    const cambios: string[] = [];
    let lineas = [...caso.lineas];
    if (dto.quitarLineas?.length) {
      lineas = lineas.filter((l) => !dto.quitarLineas!.includes(l.n));
      cambios.push(`quitó línea(s) ${dto.quitarLineas.join(', ')}`);
    }
    for (const e of dto.lineas ?? []) {
      const l = lineas.find((x) => x.n === e.n);
      if (!l) throw new BadRequestException(`No existe la línea ${e.n}`);
      for (const k of ['kilos', 'anchoMm', 'espesorMicras', 'precioUnitario'] as const) {
        if (e[k] !== undefined) {
          if (e[k] !== null && !(typeof e[k] === 'number' && e[k] > 0)) throw new BadRequestException(`Línea ${e.n}: ${k} debe ser > 0`);
          l[k] = e[k] ?? null;
        }
      }
      if (e.moneda !== undefined) l.moneda = e.moneda;
      if (e.codigoOben !== undefined) {
        l.codigoOben = e.codigoOben?.trim() || null;
        l.equivalenciaId = null;
        if (e.guardarEquivalencia && l.codigoOben && l.codigoCliente && caso.clientId) {
          // El sistema aprende: la corrección queda en la tabla para la próxima orden.
          try {
            const eq = await this.equivalences.create({ clientId: caso.clientId, clientCode: l.codigoCliente, obenCode: l.codigoOben, description: 'Agregada al corregir una orden de compra' });
            l.equivalenciaId = eq.id;
            cambios.push(`nueva equivalencia "${l.codigoCliente}" → ${l.codigoOben}`);
          } catch (err) {
            cambios.push(`no se guardó la equivalencia de la línea ${e.n}: ${(err as Error).message}`);
          }
        }
      }
      l.faltantes = faltantesLinea(l);
      cambios.push(`corrigió la línea ${e.n}`);
    }
    caso.lineas = lineas.map((l, i) => ({ ...l, n: i + 1 }));

    if (dto.direccionId !== undefined || dto.direccionManual !== undefined) {
      caso.destino = await this.destinoEditado(caso, dto);
      cambios.push(`destino: ${caso.destino.direccion}`);
    }
    if (dto.fechaRequerida !== undefined) {
      if (dto.fechaRequerida !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dto.fechaRequerida)) throw new BadRequestException('fechaRequerida: YYYY-MM-DD');
      caso.fechaRequerida = dto.fechaRequerida;
      cambios.push('fecha requerida');
    }
    if (dto.clienteFinal !== undefined) {
      caso.clienteFinal = dto.clienteFinal?.trim() || null;
      cambios.push('cliente final');
    }
    if (dto.ocNumero !== undefined) {
      caso.ocNumero = dto.ocNumero?.trim() || null;
      cambios.push('número de OC');
    }
    const client = caso.clientId ? (await this.clients.findOne(caso.clientId).catch(() => null)) : null;
    caso.missing = calcularMissing(caso, { client });
    caso.accionPendiente = null;
    this.evento(caso, 'correccion', `Corrección: ${cambios.join('; ') || 'sin cambios'}.`, this.ctx.userId);
    await this.casos.save(caso);
    return this.avanzarOc(caso);
  }

  private async destinoEditado(caso: ComercialCase, dto: EditarCasoInput) {
    if (dto.direccionId) {
      if (!caso.codigoClienteOben) throw new BadRequestException('El cliente no tiene código en OBEN MAS: no se pueden consultar sus direcciones.');
      const m = await this.intake.maestro(caso.codigoClienteOben);
      if ('error' in m) throw new BadRequestException(m.error);
      const d = m.direcciones.find((x) => x.id === dto.direccionId);
      if (!d) throw new BadRequestException(`La dirección ${dto.direccionId} no está creada para este cliente en OBEN MAS.`);
      return { direccion: d.direccion, ciudad: d.ciudad, pais: d.pais, direccionId: d.id, fuente: 'manual' as const };
    }
    const m = dto.direccionManual!;
    if (!m.direccion?.trim() || !m.pais?.trim()) throw new BadRequestException('direccionManual: direccion y pais obligatorios');
    caso.atencion = [...caso.atencion, 'Dirección escrita a mano: verifica que exista en el maestro del cliente en OBEN MAS.'];
    return { direccion: m.direccion.trim(), ciudad: m.ciudad ?? null, pais: m.pais.trim().toUpperCase(), direccionId: null, fuente: 'manual' as const };
  }

  // ─── Acciones sobre OBEN MAS (con freno de mano) ─────────────────────────

  private async solicitarAccion(caso: ComercialCase, accion: Omit<AccionPendiente, 'creadaEn'>): Promise<ComercialCase> {
    const { config } = await this.config();
    if (config.modo === 'automatico') {
      try {
        return await this.ejecutar(caso, { ...accion, creadaEn: new Date().toISOString() });
      } catch (err) {
        caso.atencion = [...caso.atencion, `No se pudo ${accion.tipo.replace('_', ' ')} automáticamente: ${(err as Error).message}`];
        this.evento(caso, 'error', `Falló "${accion.tipo}": ${(err as Error).message}`);
        await this.casos.save(caso);
        await this.avisarCS(caso, `No se pudo completar "${accion.tipo}"`, esc((err as Error).message));
        return caso;
      }
    }
    caso.accionPendiente = { ...accion, creadaEn: new Date().toISOString() };
    this.evento(caso, 'accion_pendiente', `Pendiente de confirmación: ${accion.detalle}`);
    await this.casos.save(caso);
    await this.avisarCS(
      caso,
      `Confirmar: ${accion.detalle}`,
      `<p>El flujo está en modo supervisado ("freno de mano"): esta acción espera tu confirmación en Oben Xmart → Comercial.</p><p>${esc(accion.detalle)}</p>`,
    );
    return caso;
  }

  /** Una persona confirma la acción pendiente (freno de mano). */
  async confirmar(id: string, opts: { verificadoEnObenMas?: boolean } = {}): Promise<ComercialCase> {
    const caso = await this.obtener(id);
    const accion = caso.accionPendiente;
    if (!accion) throw new BadRequestException('Este caso no tiene ninguna acción pendiente de confirmación.');
    if (accion.tipo === 'crear_proforma' && caso.missing.length > 0) {
      throw new BadRequestException({ message: 'La orden todavía tiene datos faltantes.', missing: caso.missing });
    }
    if (accion.tipo === 'modificar' && (accion.lineas ?? []).some((l) => faltantesLinea(l).length > 0)) {
      throw new BadRequestException('La modificación tiene líneas incompletas: corrígelas antes de confirmar.');
    }
    return this.ejecutar(caso, accion, { confirmadoPor: this.ctx.userId, verificadoEnObenMas: !!opts.verificadoEnObenMas });
  }

  private async ejecutar(
    caso: ComercialCase,
    accion: AccionPendiente,
    opts: { confirmadoPor?: string | null; verificadoEnObenMas?: boolean } = {},
  ): Promise<ComercialCase> {
    await this.candadoEscritura(caso);
    const quien = opts.confirmadoPor ? ` (confirmado por ${opts.confirmadoPor})` : ' (automático)';
    const ahora = new Date().toISOString();
    switch (accion.tipo) {
      case 'crear_proforma': {
        if (caso.estado !== 'oc_recibida') throw new BadRequestException(`El caso ya está "${caso.estado}".`);
        const r = await this.escribir<{ numberPF?: unknown }>(caso, 'proforma.crear', 'crear', this.argsProforma(caso), opts);
        const pf = typeof r.numberPF === 'string' || typeof r.numberPF === 'number' ? String(r.numberPF) : null;
        if (!pf) throw new BadRequestException('OBEN MAS creó la Proforma pero no devolvió su número — verifícalo allí.');
        caso.numberPF = pf;
        caso.estado = 'sin_cubicar';
        caso.fechas = { ...caso.fechas, proformaCreada: ahora };
        this.evento(caso, 'proforma_creada', `Proforma ${pf} creada en OBEN MAS (sin cubicar)${quien}.`, opts.confirmadoPor);
        break;
      }
      case 'aprobar': {
        const r = await this.escribir<{ numberOrderSales?: unknown }>(caso, 'proforma.aprobar', 'aprobar', { numberPF: caso.numberPF }, opts);
        const ov = Number(r.numberOrderSales);
        caso.numberOrderSales = Number.isInteger(ov) && ov > 0 ? ov : null;
        caso.estado = 'retenida';
        caso.fechas = { ...caso.fechas, aprobadaCliente: caso.fechas.aprobadaCliente ?? ahora, retenida: ahora };
        caso.seguimiento = await this.iniciarSeguimiento('cartera');
        this.evento(caso, 'aprobada', `Proforma aprobada: orden de venta ${caso.numberOrderSales ?? '(sin número)'} retenida, esperando cartera${quien}.`, opts.confirmadoPor);
        await this.reenviarACartera(caso);
        break;
      }
      case 'rechazar': {
        await this.escribir(caso, 'proforma.anular', 'anular', { numberPF: caso.numberPF, motivo: accion.detalle }, opts);
        caso.estado = 'rechazada';
        caso.fechas = { ...caso.fechas, rechazada: ahora };
        caso.seguimiento = { tipo: null, enviados: caso.seguimiento.enviados, proximoEn: null, ultimoEn: caso.seguimiento.ultimoEn };
        this.evento(caso, 'rechazada', `El cliente rechazó la Proforma: anulada en OBEN MAS${quien}.`, opts.confirmadoPor);
        await this.avisarComercial(caso, `Proforma ${caso.numberPF} rechazada por ${caso.cliente}`, `<p>${esc(accion.detalle)}</p>`);
        break;
      }
      case 'modificar': {
        const lineas = accion.lineas ?? [];
        const n = caso.eventos.filter((e) => e.tipo === 'modificada').length + 1;
        await this.escribir(caso, 'proforma.modificar', `modificar-${n}`, { numberPF: caso.numberPF, lineas: lineas.map(lineaArg) }, opts);
        caso.lineas = lineas;
        caso.estado = 'sin_cubicar';
        caso.seguimiento = { tipo: null, enviados: 0, proximoEn: null, ultimoEn: caso.seguimiento.ultimoEn };
        this.evento(caso, 'modificada', `Proforma modificada a pedido del cliente: vuelve a "sin cubicar" para que Planeación cubique de nuevo${quien}.`, opts.confirmadoPor);
        break;
      }
      case 'activar': {
        await this.escribir(caso, 'ov.activar', 'activar', { numberPF: caso.numberPF }, opts);
        caso.estado = 'activa';
        caso.fechas = { ...caso.fechas, activa: ahora };
        caso.seguimiento = { tipo: null, enviados: caso.seguimiento.enviados, proximoEn: null, ultimoEn: caso.seguimiento.ultimoEn };
        this.evento(caso, 'activa', `Orden de venta ${caso.numberOrderSales ?? ''} ACTIVA: comienza producción${quien}.`, opts.confirmadoPor);
        await this.avisarComercial(caso, `Orden de venta ${caso.numberOrderSales ?? caso.numberPF} activa`, '<p>Cartera liberó la orden y quedó activa en OBEN MAS: comienza producción.</p>');
        break;
      }
    }
    caso.accionPendiente = null;
    caso.nextCheckAt = this.proximoChequeo(caso);
    await this.casos.save(caso);
    await this.audit.log({
      workflowName: WORKFLOW,
      action: `comercial_${accion.tipo}`,
      entityType: 'comercial_case',
      entityId: caso.id,
      actorId: opts.confirmadoPor ?? this.ctx.userId,
      outputData: { estado: caso.estado, numberPF: caso.numberPF, numberOrderSales: caso.numberOrderSales, simulated: caso.simulated, automatico: !opts.confirmadoPor },
    });
    return caso;
  }

  /** Candado: datos simulados nunca se escriben en un OBEN MAS real. */
  private async candadoEscritura(caso: ComercialCase): Promise<void> {
    if (!caso.simulated) return;
    const { mode } = await this.hub.capabilities('obenPlus');
    if (mode === 'real') {
      throw new BadRequestException(
        `Candado: este caso usa datos SIMULADOS (${caso.simulatedItems.join('; ')}) y OBEN MAS está conectado de verdad — no se escribe nada allí.`,
      );
    }
  }

  /** Escritura idempotente en OBEN MAS: un reintento nunca repite la operación. */
  private async escribir<T = Record<string, unknown>>(
    caso: ComercialCase,
    operation: string,
    clave: string,
    args: Record<string, unknown>,
    opts: { verificadoEnObenMas?: boolean },
  ): Promise<T> {
    const tenantId = this.ctx.tenantId;
    const key = `comercial:${caso.id}:${clave}`;
    const claim = await this.idempotency.claim<{ ambiguous?: boolean; data?: T }>(tenantId, `comercial.${operation}`, key, 90 * 24 * HOUR_MS);
    if (!claim.claimed) {
      if (claim.existingStatus === 'completed') return (claim.existingResult?.data ?? {}) as T;
      if (claim.existingStatus === 'processing') throw new ConflictException(`"${operation}" de este caso ya se está ejecutando.`);
      // failed: un error de negocio se puede reintentar; uno ambiguo (timeout/red) exige verificar primero en OBEN MAS.
      if (claim.existingResult?.ambiguous && !opts.verificadoEnObenMas) {
        throw new ConflictException(
          `El intento anterior de "${operation}" quedó sin respuesta (timeout/red): pudo haberse hecho en OBEN MAS. Verifica allí y confirma de nuevo con verificadoEnObenMas:true.`,
        );
      }
      if (!(await this.idempotency.reclaimFailed(tenantId, key))) throw new ConflictException(`Otra solicitud está reintentando "${operation}".`);
    }
    const res = await this.hub.call<T>('obenPlus', operation, args, { maxAttempts: 1, timeoutMs: 60_000 });
    if (!res.ok) {
      const error = res.error ?? 'error desconocido';
      const ambiguous = /timeout|aborted|fetch failed|ECONN|socket|HTTP 5\d\d|circuit_open/i.test(error) && !/BUSINESS_ERROR/.test(error);
      await this.idempotency.saveProgress(tenantId, key, { ambiguous });
      await this.idempotency.markFailed(tenantId, key, error);
      throw new BadRequestException(`OBEN MAS no completó "${operation}": ${error}${ambiguous ? ' (respuesta ambigua: verifica en OBEN MAS antes de reintentar)' : ''}`);
    }
    await this.idempotency.markCompleted(tenantId, key, { data: res.data });
    return (res.data ?? {}) as T;
  }

  private argsProforma(caso: ComercialCase): Record<string, unknown> {
    return {
      codigoCliente: caso.codigoClienteOben,
      cliente: caso.cliente,
      pais: caso.destino?.pais ?? caso.pais,
      direccionEntrega: caso.destino?.direccion,
      direccionId: caso.destino?.direccionId ?? null,
      ordenCompra: caso.ocNumero,
      clienteFinal: caso.clienteFinal,
      fechaRequerida: caso.fechaRequerida,
      lineas: caso.lineas.map(lineaArg),
    };
  }

  // ─── Proforma al cliente ─────────────────────────────────────────────────

  /**
   * Envía el PDF de la Proforma (tal cual lo entrega OBEN MAS) al cliente, en
   * el mismo hilo de su orden de compra, con copia al comercial.
   */
  async enviarAlCliente(idOrCaso: string | ComercialCase): Promise<ComercialCase> {
    const caso = typeof idOrCaso === 'string' ? await this.obtener(idOrCaso) : idOrCaso;
    if (!caso.numberPF || (caso.estado !== 'cubicada' && caso.estado !== 'enviada_cliente')) {
      throw new BadRequestException(`La Proforma solo se envía cuando está cubicada (el caso está "${caso.estado}").`);
    }
    const pdfRes = await this.hub.call<Record<string, unknown>>('obenPlus', 'proforma.pdf', { numberPF: caso.numberPF }, OBEN_QUERY_OPTIONS);
    const base64 = pdfRes.ok && typeof pdfRes.data?.contentBase64 === 'string' ? pdfRes.data.contentBase64 : null;
    const pdf = base64 ? Buffer.from(base64, 'base64') : null;
    if (!pdf || pdf.subarray(0, 4).toString() !== '%PDF') {
      return this.bloquearEnvio(caso, `No se pudo obtener el PDF de la Proforma de OBEN MAS (${pdfRes.error ?? 'respuesta sin PDF válido'}).`, true);
    }
    const pdfSimulado = pdfRes.mode === 'mock' || pdfRes.data?.simulated === true;
    const sim = pdfSimulado || caso.simulated;

    const copia = await this.distributionLists.resolveRecipients('document', LISTA_COPIA_PROFORMA);
    const cc = uniq([caso.comercialEmail, ...copia.to, ...copia.cc].filter((x): x is string => !!x && x !== caso.contactoEmail));
    if (sim) {
      const { mode } = await this.hub.capabilities('email');
      const destinatariosDemo = [caso.contactoEmail, ...cc].every((e) => DOMINIO_DEMO_RE.test(e.split('@')[1] ?? ''));
      if (mode === 'real' && !destinatariosDemo) {
        return this.bloquearEnvio(
          caso,
          `Candado: la Proforma o el caso son SIMULADOS (${[pdfSimulado ? PROFORMA_PDF_SIMULADA_LABEL : null, ...caso.simulatedItems].filter(Boolean).join('; ')}) — nunca se envían a un cliente real. Se enviará cuando OBEN MAS entregue el PDF oficial.`,
          false,
        );
      }
    }

    const filename = sim ? `Proforma_SIMULADA-PF${caso.numberPF}.pdf` : (typeof pdfRes.data?.filename === 'string' && pdfRes.data.filename) || `Proforma-PF${caso.numberPF}.pdf`;
    const reenvio = caso.estado === 'enviada_cliente';
    const asunto = `${sim ? '[SIMULADO] ' : ''}Proforma ${caso.numberPF}${caso.ocNumero ? ` — su orden de compra ${caso.ocNumero}` : ''} [PF ${caso.numberPF}]`;
    const cuerpo = [
      '<p>Buen día,</p>',
      `<p>Adjuntamos la Proforma N.° ${esc(caso.numberPF)}${caso.ocNumero ? ` correspondiente a su orden de compra ${esc(caso.ocNumero)}` : ''}. Por favor revísela y respóndanos en este mismo correo con su aprobación (Proforma firmada o confirmación por escrito), o indíquenos si requiere algún cambio.</p>`,
      '<p>Cordialmente,<br>Customer Service — Oben</p>',
      sim ? `<p><strong>SIMULADO:</strong> ${esc(PROFORMA_PDF_SIMULADA_LABEL)}. Correo de prueba.</p>` : '',
    ].join('');
    const res = await this.enviarCorreo(caso, {
      to: caso.contactoEmail,
      cc,
      subject: reenvio ? `Re: ${asunto}` : asunto,
      body: cuerpo,
      attachments: [{ filename, content: pdf.toString('base64'), encoding: 'base64', contentType: 'application/pdf' }],
    });
    if (!res.ok) return this.bloquearEnvio(caso, `No se pudo enviar la Proforma al cliente: ${res.error}`, true);

    const ahora = new Date();
    caso.estado = 'enviada_cliente';
    caso.fechas = { ...caso.fechas, enviadaCliente: caso.fechas.enviadaCliente ?? ahora.toISOString() };
    caso.seguimiento = await this.iniciarSeguimiento('firma');
    caso.nextCheckAt = this.proximoChequeo(caso);
    this.evento(caso, 'proforma_enviada', `Proforma ${caso.numberPF} enviada a ${caso.contactoEmail}${cc.length ? ` (copia: ${cc.join(', ')})` : ''}${sim ? ' — SIMULADA' : ''}.`);
    await this.casos.save(caso);
    return caso;
  }

  private async bloquearEnvio(caso: ComercialCase, motivo: string, reintentar: boolean): Promise<ComercialCase> {
    if (!caso.atencion.includes(motivo)) caso.atencion = [...caso.atencion, motivo];
    this.evento(caso, 'envio_bloqueado', motivo);
    caso.nextCheckAt = reintentar ? new Date(Date.now() + (POLL_MS.cubicada ?? HOUR_MS)) : null;
    await this.casos.save(caso);
    await this.audit.log({
      workflowName: WORKFLOW,
      action: 'comercial_envio_proforma_bloqueado',
      entityType: 'comercial_case',
      entityId: caso.id,
      actorId: this.ctx.userId,
      outputData: { numberPF: caso.numberPF, reintentar },
      reason: motivo,
    });
    return caso;
  }

  // ─── Respuesta del cliente ───────────────────────────────────────────────

  /** Caso abierto al que responde un correo: por el hilo (In-Reply-To/References) o por "[PF n]" en el asunto. */
  async buscarPorHilo(correo: Pick<RespuestaCorreo, 'inReplyTo' | 'references' | 'subject'>): Promise<ComercialCase | null> {
    const ids = new Set([correo.inReplyTo, ...(correo.references ?? [])].filter((x): x is string => !!x));
    const pf = correo.subject.match(/\[PF\s+([A-Za-z0-9-]+)\]/i)?.[1] ?? null;
    if (ids.size === 0 && !pf) return null;
    const abiertos = await this.casos.find({ where: { tenantId: this.ctx.tenantId, estado: In([...CASO_ESTADOS_ABIERTOS]) } });
    return (
      abiertos.find((c) => c.hiloMessageIds.some((m) => ids.has(m))) ??
      abiertos.find((c) => !!c.ocMessageId && ids.has(c.ocMessageId) && c.estado !== 'oc_recibida') ??
      (pf ? (abiertos.find((c) => c.numberPF === pf) ?? null) : null)
    );
  }

  /** Correo entrante que responde a una Proforma. `null` si no pertenece a ningún caso. */
  async procesarCorreoRespuesta(correo: RespuestaCorreo): Promise<{ caso: ComercialCase; tipo: TipoRespuesta | 'no_autorizado' } | null> {
    const caso = await this.buscarPorHilo(correo);
    if (!caso) return null;
    if (correo.messageId && caso.eventos.some((e) => e.detalle.includes(correo.messageId!))) return { caso, tipo: 'desconocida' };

    const dominio = (correo.from.split('@')[1] ?? '').toLowerCase();
    const { client } = await this.clients.findByEmailDomain(dominio);
    if (!client || client.id !== caso.clientId) {
      const motivo = `Respuesta desde un dominio NO autorizado para ${caso.cliente} (${correo.from}) — posible suplantación: no se tomó ninguna acción.`;
      caso.atencion = [...caso.atencion, motivo];
      this.evento(caso, 'respuesta_no_autorizada', `${motivo} [${correo.messageId ?? 'sin Message-ID'}]`);
      await this.casos.save(caso);
      await this.avisarCS(caso, `ALERTA: respuesta a la Proforma ${caso.numberPF} desde un dominio no autorizado`, `<p>${esc(motivo)}</p>`);
      return { caso, tipo: 'no_autorizado' };
    }
    const { tipo, motivo } = clasificarRespuesta(correo.body, correo.attachments ?? []);
    const actualizado = await this.registrarRespuesta(caso, { tipo, motivo, texto: correo.body, adjuntos: correo.attachments ?? [], via: `correo ${correo.messageId ?? ''}`.trim() });
    return { caso: actualizado, tipo };
  }

  /** Respuesta del cliente (por correo, o registrada a mano si llegó por teléfono/WhatsApp). */
  async registrarRespuesta(
    caso: ComercialCase,
    r: { tipo: TipoRespuesta; motivo: string; texto?: string; adjuntos?: OcAdjunto[]; via: string; lineas?: CasoLinea[] },
  ): Promise<ComercialCase> {
    if (caso.estado !== 'enviada_cliente' && caso.estado !== 'cubicada') {
      caso.atencion = [...caso.atencion, `Llegó una respuesta del cliente con el caso en "${caso.estado}": revísala (${r.motivo}).`];
      this.evento(caso, 'respuesta', `Respuesta fuera de etapa (${r.tipo}) vía ${r.via}: ${r.motivo}`);
      await this.casos.save(caso);
      return caso;
    }
    this.evento(caso, 'respuesta', `Respuesta del cliente (${r.tipo}) vía ${r.via}: ${r.motivo}`);
    caso.seguimiento = { ...caso.seguimiento, tipo: null, proximoEn: null };

    const firmado = (r.adjuntos ?? []).find((a) => a.content && (/\.pdf$/i.test(a.filename) || (a.contentType ?? '').includes('pdf')));
    switch (r.tipo) {
      case 'aprueba': {
        caso.fechas = { ...caso.fechas, aprobadaCliente: new Date().toISOString() };
        if (firmado?.content) {
          caso.proformaFirmada = firmado.content;
          caso.proformaFirmadaNombre = firmado.filename;
        }
        return this.solicitarAccion(caso, { tipo: 'aprobar', detalle: `El cliente aprobó la Proforma ${caso.numberPF}: pasarla a orden de venta retenida en OBEN MAS. ${r.motivo}` });
      }
      case 'rechaza':
        return this.solicitarAccion(caso, { tipo: 'rechazar', detalle: `El cliente rechazó la Proforma ${caso.numberPF}: anularla en OBEN MAS. ${r.motivo}` });
      case 'modifica': {
        const { config } = await this.config();
        const lineas = r.lineas ?? (r.texto ? await this.intake.extraerModificacion(caso, r.texto, config) : []);
        if (lineas.length === 0) {
          caso.atencion = [...caso.atencion, `El cliente pide modificar la Proforma pero no se pudieron leer las nuevas cantidades: ${r.motivo}`];
          caso.accionPendiente = { tipo: 'modificar', detalle: `Modificar la Proforma ${caso.numberPF}: completa las líneas nuevas. ${r.motivo}`, creadaEn: new Date().toISOString(), lineas: [] };
          await this.casos.save(caso);
          await this.avisarCS(caso, `El cliente pide modificar la Proforma ${caso.numberPF}`, `<p>${esc(r.motivo)}</p><p>No se pudieron leer las nuevas cantidades: complétalas en Oben Xmart.</p>`);
          return caso;
        }
        const incompletas = lineas.some((l) => faltantesLinea(l).length > 0);
        if (incompletas) {
          caso.accionPendiente = { tipo: 'modificar', detalle: `Modificar la Proforma ${caso.numberPF} (hay líneas incompletas). ${r.motivo}`, creadaEn: new Date().toISOString(), lineas };
          await this.casos.save(caso);
          await this.avisarCS(caso, `El cliente pide modificar la Proforma ${caso.numberPF}`, `<p>${esc(r.motivo)}</p><p>Hay líneas incompletas: revísalas antes de confirmar.</p>`);
          return caso;
        }
        return this.solicitarAccion(caso, { tipo: 'modificar', detalle: `Modificar la Proforma ${caso.numberPF} a pedido del cliente (${lineas.length} línea(s)). ${r.motivo}`, lineas });
      }
      default:
        caso.atencion = [...caso.atencion, r.motivo];
        await this.casos.save(caso);
        await this.avisarCS(caso, `Respuesta del cliente a la Proforma ${caso.numberPF}: revisar`, `<p>${esc(r.motivo)}</p>`);
        return caso;
    }
  }

  /**
   * Líneas registradas a mano (respuesta por teléfono/WhatsApp): la
   * referencia Oben escrita por la persona manda; si no la escribe, se
   * traduce con la tabla de equivalencias del cliente — nunca se adivina.
   */
  async lineasManuales(caso: ComercialCase, items: Array<{ codigoCliente: string; kilos: number; anchoMm: number; codigoOben?: string }>): Promise<CasoLinea[]> {
    const tabla = caso.clientId
      ? (await this.equivalences.findAll(caso.clientId)).map((e) => ({ id: e.id, clientCode: e.clientCode, obenCode: e.obenCode }))
      : [];
    return items.map((l, i) =>
      construirLinea(
        i + 1,
        { textoCliente: l.codigoCliente, codigoCliente: l.codigoCliente, cantidad: l.kilos, unidad: 'kg', ancho: l.anchoMm, unidadAncho: 'mm' },
        l.codigoOben ? [{ id: 'manual', clientCode: l.codigoCliente, obenCode: l.codigoOben }] : tabla,
      ),
    );
  }

  async anular(id: string, motivo: string): Promise<ComercialCase> {
    const caso = await this.obtener(id);
    if (!CASO_ESTADOS_ABIERTOS.includes(caso.estado) || caso.estado === 'activa') {
      throw new BadRequestException(`Un caso "${caso.estado}" no se puede anular.`);
    }
    if (caso.numberPF) {
      await this.candadoEscritura(caso);
      await this.escribir(caso, 'proforma.anular', 'anular', { numberPF: caso.numberPF, motivo }, {});
    }
    caso.estado = 'anulada';
    caso.accionPendiente = null;
    caso.nextCheckAt = null;
    caso.seguimiento = { ...caso.seguimiento, tipo: null, proximoEn: null };
    caso.fechas = { ...caso.fechas, anulada: new Date().toISOString() };
    this.evento(caso, 'anulada', `Dado de baja: ${motivo}`, this.ctx.userId);
    await this.casos.save(caso);
    await this.audit.log({ workflowName: WORKFLOW, action: 'comercial_anulado', entityType: 'comercial_case', entityId: caso.id, actorId: this.ctx.userId, reason: motivo });
    return caso;
  }

  // ─── Procesamiento periódico (ComercialProcessorService) ─────────────────

  /** Un paso del ciclo de vida de un caso abierto: consulta OBEN MAS y dispara lo que toque. */
  async procesar(caso: ComercialCase): Promise<ComercialCase> {
    if (!CASO_ESTADOS_ABIERTOS.includes(caso.estado) || !caso.numberPF) {
      caso.nextCheckAt = null;
      return this.casos.save(caso);
    }
    const status = await this.hub.call<Record<string, unknown>>('obenPlus', 'proforma.status', { numberPF: caso.numberPF }, OBEN_QUERY_OPTIONS);
    const estadoOben = status.ok ? (status.data?.estado as string | undefined) : undefined;
    if (status.ok && status.data?.anulada === true && caso.estado !== 'anulada') {
      caso.estado = 'anulada';
      caso.fechas = { ...caso.fechas, anulada: new Date().toISOString() };
      this.evento(caso, 'anulada', 'La Proforma aparece anulada en OBEN MAS.');
      caso.nextCheckAt = null;
      return this.casos.save(caso);
    }

    switch (caso.estado) {
      case 'sin_cubicar':
        if (estadoOben === 'cubicada') {
          caso.estado = 'cubicada';
          caso.fechas = { ...caso.fechas, cubicada: new Date().toISOString() };
          this.evento(caso, 'cubicada', 'Planeación cubicó la Proforma.');
          await this.casos.save(caso);
          return this.enviarAlCliente(caso);
        }
        this.sincronizarAvance(caso, estadoOben, status.data);
        break;
      case 'cubicada':
        if (!caso.atencion.some((a) => a.startsWith('Candado:'))) return this.enviarAlCliente(caso);
        break;
      case 'enviada_cliente':
        if (estadoOben === 'sin_cubicar') {
          caso.estado = 'sin_cubicar';
          this.evento(caso, 'modificada', 'La Proforma volvió a "sin cubicar" en OBEN MAS (modificada allí).');
        } else if (!this.sincronizarAvance(caso, estadoOben, status.data) && this.vencido(caso)) {
          await this.recordatorioFirma(caso);
        }
        break;
      case 'retenida': {
        if (this.sincronizarAvance(caso, estadoOben, status.data)) break;
        const cartera = await this.hub.call<Record<string, unknown>>('obenPlus', 'proforma.cartera', { numberPF: caso.numberPF }, OBEN_QUERY_OPTIONS);
        if (cartera.ok && cartera.data?.liberada === true) {
          if (!caso.fechas.carteraLiberada) {
            caso.fechas = { ...caso.fechas, carteraLiberada: new Date().toISOString() };
            this.evento(caso, 'cartera_liberada', 'Cartera liberó la orden.');
          }
          caso.seguimiento = { ...caso.seguimiento, tipo: null, proximoEn: null };
          if (caso.accionPendiente?.tipo !== 'activar') {
            return this.solicitarAccion(caso, { tipo: 'activar', detalle: `Cartera liberó la OV ${caso.numberOrderSales ?? ''} (PF ${caso.numberPF}): pasarla a ACTIVA en OBEN MAS.` });
          }
        } else if (this.vencido(caso)) {
          await this.seguimientoCartera(caso, cartera.ok ? (cartera.data?.observacion as string | undefined) : undefined);
        }
        break;
      }
      case 'activa': {
        const f = (status.data?.fechas ?? {}) as Record<string, unknown>;
        const nueva = typeof f.entregaComprometida === 'string' ? f.entregaComprometida : null;
        if (status.ok && nueva !== caso.entregaComprometida) {
          const anterior = caso.entregaComprometida;
          caso.entregaHistorial = [...caso.entregaHistorial, { fecha: new Date().toISOString(), anterior, nueva }];
          caso.entregaComprometida = nueva;
          if (anterior) {
            // Alejandra (48:42): "se me había dicho que el 29, ahora ya no es el 29 sino el 2".
            this.evento(caso, 'cambio_entrega', `La entrega comprometida cambió: ${anterior} → ${nueva ?? '(sin fecha)'}.`);
            await this.avisarCS(caso, `Cambio de fecha de entrega — OV ${caso.numberOrderSales ?? caso.numberPF}`, `<p>Planeación cambió la entrega comprometida de ${esc(anterior)} a ${esc(nueva ?? '(sin fecha)')}. Revisa si hay que avisar al cliente.</p>`);
          }
        }
        if (caso.numberOrderSales && (await this.despachada(caso.numberOrderSales))) {
          caso.estado = 'cerrada';
          caso.fechas = { ...caso.fechas, cerrada: new Date().toISOString() };
          this.evento(caso, 'cerrada', 'Lista de Empaque enviada: pedido en despacho, fin del seguimiento comercial.');
        }
        break;
      }
    }
    caso.nextCheckAt = this.proximoChequeo(caso);
    return this.casos.save(caso);
  }

  /** OBEN MAS ya avanzó por su cuenta (alguien lo hizo a mano allá): se alinea el caso. */
  private sincronizarAvance(caso: ComercialCase, estadoOben: string | undefined, data: Record<string, unknown> | undefined): boolean {
    const orden: Partial<Record<string, number>> = { sin_cubicar: 1, cubicada: 2, enviada_cliente: 2, retenida: 3, activa: 4 };
    if (!estadoOben || (orden[estadoOben] ?? 0) <= (orden[caso.estado] ?? 0)) return false;
    if (estadoOben !== 'retenida' && estadoOben !== 'activa') return false;
    const ov = Number(data?.numberOrderSales);
    if (Number.isInteger(ov) && ov > 0) caso.numberOrderSales = ov;
    caso.estado = estadoOben;
    caso.accionPendiente = null;
    const ahora = new Date().toISOString();
    caso.fechas = estadoOben === 'retenida' ? { ...caso.fechas, retenida: ahora } : { ...caso.fechas, activa: ahora };
    caso.seguimiento = { tipo: estadoOben === 'retenida' ? 'cartera' : null, enviados: 0, proximoEn: null, ultimoEn: caso.seguimiento.ultimoEn };
    this.evento(caso, estadoOben, `OBEN MAS ya muestra la orden "${estadoOben}" (hecho directamente en OBEN MAS).`);
    return true;
  }

  private vencido(caso: ComercialCase): boolean {
    return !!caso.seguimiento.tipo && !!caso.seguimiento.proximoEn && Date.parse(caso.seguimiento.proximoEn) <= Date.now();
  }

  private async recordatorioFirma(caso: ComercialCase): Promise<void> {
    const n = caso.seguimiento.enviados + 1;
    const asunto = `${caso.simulated ? '[SIMULADO] ' : ''}Re: Proforma ${caso.numberPF}${caso.ocNumero ? ` — su orden de compra ${caso.ocNumero}` : ''} [PF ${caso.numberPF}]`;
    const res = await this.enviarCorreo(caso, {
      to: caso.contactoEmail,
      cc: [caso.comercialEmail].filter((x): x is string => !!x),
      subject: asunto,
      body: `<p>Buen día,</p><p>Le recordamos que la Proforma N.° ${esc(caso.numberPF!)} está pendiente de su aprobación. Por favor respóndanos en este mismo correo con la Proforma firmada o su confirmación, o indíquenos si requiere algún cambio.</p><p>Cordialmente,<br>Customer Service — Oben</p>`,
    });
    await this.avanzarSeguimiento(caso, 'firma', res.ok, `Recordatorio n.º ${n} al cliente`, res.error);
  }

  private async seguimientoCartera(caso: ComercialCase, observacion?: string): Promise<void> {
    const dias = caso.fechas.retenida ? Math.floor((Date.now() - Date.parse(caso.fechas.retenida)) / (24 * HOUR_MS)) : null;
    const para = caso.comercialEmail ?? (await this.distributionLists.resolveRecipients('document', LISTA_CUSTOMER_SERVICE)).to[0] ?? null;
    if (!para) {
      await this.avanzarSeguimiento(caso, 'cartera', false, 'Seguimiento de cartera', 'el cliente no tiene comercial asignado ni hay lista comercial_customer_service');
      return;
    }
    const cs = await this.distributionLists.resolveRecipients('document', LISTA_CUSTOMER_SERVICE);
    const res = await this.enviarCorreo(caso, {
      to: para,
      cc: [...cs.to, ...cs.cc].filter((x) => x !== para),
      subject: `${caso.simulated ? '[SIMULADO] ' : ''}OV ${caso.numberOrderSales ?? ''} (PF ${caso.numberPF}) — retenida por cartera${dias !== null ? ` hace ${dias} día(s)` : ''}: ¿en qué va?`,
      body: `<p>La orden de venta ${caso.numberOrderSales ?? ''} de ${esc(caso.cliente ?? '')} (Proforma ${esc(caso.numberPF!)}) sigue retenida por cartera${dias !== null ? ` desde hace ${dias} día(s)` : ''}.</p>${observacion ? `<p>Cartera: ${esc(observacion)}</p>` : ''}<p>¿Cómo va la gestión con el cliente? Si el pedido no continúa, avísanos para darlo de baja.</p>`,
    });
    await this.avanzarSeguimiento(caso, 'cartera', res.ok, 'Seguimiento de cartera al comercial', res.error);
  }

  private async avanzarSeguimiento(caso: ComercialCase, tipo: 'firma' | 'cartera', ok: boolean, que: string, error?: string): Promise<void> {
    const { config } = await this.config();
    const enviados = caso.seguimiento.enviados + (ok ? 1 : 0);
    const horas = ok ? horasHastaSiguiente(tipo === 'firma' ? config.seguimientoFirma : config.seguimientoCartera, enviados) : 1;
    caso.seguimiento = {
      tipo: horas === null ? null : tipo,
      enviados,
      proximoEn: horas === null ? null : new Date(Date.now() + horas * HOUR_MS).toISOString(),
      ultimoEn: ok ? new Date().toISOString() : caso.seguimiento.ultimoEn,
    };
    this.evento(caso, `seguimiento_${tipo}`, ok ? `${que} (n.º ${enviados}).` : `${que}: no se pudo enviar (${error ?? 'error'}).`);
  }

  private async iniciarSeguimiento(tipo: 'firma' | 'cartera') {
    const { config } = await this.config();
    const horas = horasHastaSiguiente(tipo === 'firma' ? config.seguimientoFirma : config.seguimientoCartera, 0);
    return { tipo: horas === null ? null : tipo, enviados: 0, proximoEn: horas === null ? null : new Date(Date.now() + horas * HOUR_MS).toISOString(), ultimoEn: null };
  }

  private proximoChequeo(caso: ComercialCase): Date | null {
    const poll = POLL_MS[caso.estado];
    if (!poll || !caso.numberPF) return null;
    const seg = caso.seguimiento.proximoEn ? Date.parse(caso.seguimiento.proximoEn) : Infinity;
    return new Date(Math.min(Date.now() + poll, seg));
  }

  /** La Lista de Empaque de la OV ya salió (auditoría de PackingListAutomationService). */
  private async despachada(ov: number): Promise<boolean> {
    const eventos = await this.audit.listForEntity('packing_list', String(ov));
    return eventos.some((e) => e.action === 'ov_approved_lista_empaque_enviada' && e.outputData?.ok !== false);
  }

  /** Hoy se reenvía a mano a cartera la Proforma aprobada (Alejandra, 9:52): ahora sale sola. */
  private async reenviarACartera(caso: ComercialCase): Promise<void> {
    const lista = await this.distributionLists.resolveRecipients('document', LISTA_CARTERA);
    if (lista.to.length === 0) {
      this.evento(caso, 'aviso', `No hay lista "${LISTA_CARTERA}": no se reenvió la aprobación a cartera.`);
      return;
    }
    const [to, ...rest] = lista.to;
    const firmado = await this.proformaFirmada(caso.id);
    const res = await this.enviarCorreo(caso, {
      to,
      cc: [...rest, ...lista.cc],
      subject: `${caso.simulated ? '[SIMULADO] ' : ''}Proforma ${caso.numberPF} aprobada por ${caso.cliente} — OV ${caso.numberOrderSales ?? ''} retenida, pendiente de cartera`,
      body: `<p>${esc(caso.cliente ?? '')} aprobó la Proforma ${esc(caso.numberPF!)}${caso.ocNumero ? ` (orden de compra ${esc(caso.ocNumero)})` : ''}. La orden de venta ${caso.numberOrderSales ?? ''} quedó retenida en OBEN MAS a la espera de la validación de cartera.</p>${firmado ? '<p>Adjunta la Proforma aprobada por el cliente.</p>' : ''}`,
      attachments: firmado ? [{ filename: firmado.nombre, content: firmado.buffer.toString('base64'), encoding: 'base64', contentType: 'application/pdf' }] : undefined,
      enHilo: false,
    });
    this.evento(caso, 'reenvio_cartera', res.ok ? `Aprobación reenviada a cartera (${to}).` : `No se pudo reenviar a cartera: ${res.error}`);
  }

  async proformaFirmada(id: string): Promise<{ nombre: string; buffer: Buffer } | null> {
    const row = await this.casos
      .createQueryBuilder('c')
      .addSelect('c.proformaFirmada')
      .where('c.id = :id AND c.tenant_id = :t', { id, t: this.ctx.tenantId })
      .getOne();
    return row?.proformaFirmada ? { nombre: row.proformaFirmadaNombre ?? 'Proforma_firmada.pdf', buffer: row.proformaFirmada } : null;
  }

  // ─── Consultas ───────────────────────────────────────────────────────────

  async obtener(id: string): Promise<ComercialCase> {
    const caso = await this.casos.findOne({ where: { tenantId: this.ctx.tenantId, id } });
    if (!caso) throw new NotFoundException(`Caso comercial ${id} no encontrado`);
    return caso;
  }

  async listar(f: FiltrosCasos = {}): Promise<ComercialCase[]> {
    return this.casos.find({ where: this.where(f), order: { ocRecibidaEn: 'DESC' }, take: 500 });
  }

  /**
   * Tablero (Hernán, 3:07–5:24): cuántas órdenes hay en cada etapa, filtrable
   * por rango de fechas y cliente, con la fecha de cada fase y lo que
   * requiere atención.
   */
  async tablero(f: FiltrosCasos = {}) {
    const casos = await this.casos.find({ where: this.where({ ...f, estado: undefined }), order: { ocRecibidaEn: 'DESC' }, take: 5000 });
    const embudo = Object.fromEntries(CASO_ESTADOS.map((e) => [e, 0])) as Record<CasoEstado, number>;
    for (const c of casos) embudo[c.estado]++;
    const porCliente = new Map<string, { cliente: string; total: number; abiertas: number }>();
    for (const c of casos) {
      const k = c.cliente ?? '(sin identificar)';
      const x = porCliente.get(k) ?? { cliente: k, total: 0, abiertas: 0 };
      x.total++;
      if (CASO_ESTADOS_ABIERTOS.includes(c.estado)) x.abiertas++;
      porCliente.set(k, x);
    }
    const horasEntre = (a: keyof ComercialCase['fechas'], b: keyof ComercialCase['fechas']) => {
      const xs = casos
        .filter((c) => c.fechas[a] && c.fechas[b])
        .map((c) => (Date.parse(c.fechas[b]!) - Date.parse(c.fechas[a]!)) / HOUR_MS);
      return xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null;
    };
    return {
      filtros: f,
      simulated: casos.some((c) => c.simulated),
      total: casos.length,
      embudo,
      abiertas: casos.filter((c) => CASO_ESTADOS_ABIERTOS.includes(c.estado)).length,
      requierenAtencion: casos
        .filter((c) => CASO_ESTADOS_ABIERTOS.includes(c.estado) && (c.missing.length > 0 || c.atencion.length > 0 || c.accionPendiente))
        .map((c) => ({
          id: c.id,
          cliente: c.cliente,
          ocNumero: c.ocNumero,
          numberPF: c.numberPF,
          estado: c.estado,
          accionPendiente: c.accionPendiente?.detalle ?? null,
          motivos: [...c.missing, ...c.atencion].slice(0, 5),
        })),
      porCliente: [...porCliente.values()].sort((a, b) => b.total - a.total),
      tiemposPromedioHoras: {
        ocAProforma: horasEntre('ocRecibida', 'proformaCreada'),
        proformaACubicada: horasEntre('proformaCreada', 'cubicada'),
        envioAAprobacion: horasEntre('enviadaCliente', 'aprobadaCliente'),
        retenidaALiberada: horasEntre('retenida', 'carteraLiberada'),
        ocAActiva: horasEntre('ocRecibida', 'activa'),
      },
    };
  }

  private where(f: FiltrosCasos): FindOptionsWhere<ComercialCase> {
    const where: FindOptionsWhere<ComercialCase> = { tenantId: this.ctx.tenantId };
    if (f.estado) {
      if (!(CASO_ESTADOS as readonly string[]).includes(f.estado)) throw new BadRequestException(`estado inválido. Válidos: ${CASO_ESTADOS.join(', ')}`);
      where.estado = f.estado as CasoEstado;
    }
    if (f.cliente?.trim()) where.cliente = ILike(`%${f.cliente.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    const desde = f.desde ? parseFecha(f.desde, 'desde') : null;
    const hasta = f.hasta ? new Date(parseFecha(f.hasta, 'hasta').getTime() + 24 * HOUR_MS - 1) : null;
    if (desde && hasta) where.ocRecibidaEn = Between(desde, hasta);
    else if (desde) where.ocRecibidaEn = MoreThanOrEqual(desde);
    else if (hasta) where.ocRecibidaEn = LessThanOrEqual(hasta);
    return where;
  }

  // ─── Correo y avisos ─────────────────────────────────────────────────────

  private async enviarCorreo(
    caso: ComercialCase,
    m: { to: string; cc?: string[]; subject: string; body: string; attachments?: unknown[]; enHilo?: boolean },
  ): Promise<{ ok: boolean; error?: string }> {
    const hilo = m.enHilo === false ? [] : [caso.ocMessageId, ...caso.hiloMessageIds].filter((x): x is string => !!x);
    const res = await this.hub.call<{ id?: string }>(
      'email',
      'send',
      {
        to: m.to,
        ...(m.cc?.length ? { cc: uniq(m.cc).join(',') } : {}),
        subject: m.subject,
        body: m.body,
        ...(m.attachments ? { attachments: m.attachments } : {}),
        ...(hilo.length ? { inReplyTo: hilo[hilo.length - 1], references: hilo } : {}),
      },
      { maxAttempts: 1, timeoutMs: 30_000 },
    );
    if (res.ok && res.data?.id && m.enHilo !== false) caso.hiloMessageIds = [...caso.hiloMessageIds, res.data.id];
    await this.audit.log({
      workflowName: WORKFLOW,
      eventType: WorkflowEventType.NOTIFICATION_SENT,
      action: 'comercial_correo',
      entityType: 'comercial_case',
      entityId: caso.id,
      actorId: this.ctx.userId,
      outputData: { to: m.to, cc: m.cc ?? [], subject: m.subject, ok: res.ok, messageId: res.data?.id ?? null, simulated: caso.simulated },
      reason: res.ok ? null : (res.error ?? 'error desconocido'),
    });
    return { ok: res.ok, error: res.error };
  }

  private async avisarCS(caso: ComercialCase, asunto: string, cuerpoHtml: string): Promise<void> {
    const lista = await this.distributionLists.resolveRecipients('document', LISTA_CUSTOMER_SERVICE);
    if (lista.to.length === 0) {
      this.logger.warn(`Caso ${caso.id}: no hay lista "${LISTA_CUSTOMER_SERVICE}" — aviso no enviado: ${asunto}`);
      return;
    }
    const [to, ...rest] = lista.to;
    await this.enviarCorreo(caso, {
      to,
      cc: [...rest, ...lista.cc],
      subject: `${caso.simulated ? '[SIMULADO] ' : ''}[Comercial] ${asunto}`,
      body: `${cuerpoHtml}<p>Cliente: ${esc(caso.cliente ?? caso.contactoEmail)} · OC: ${esc(caso.ocNumero ?? '—')} · Proforma: ${esc(caso.numberPF ?? '—')}</p>${caso.simulated ? `<p><strong>SIMULADO:</strong> ${esc(caso.simulatedItems.join('; '))}</p>` : ''}`,
      enHilo: false,
    });
  }

  private async avisarComercial(caso: ComercialCase, asunto: string, cuerpoHtml: string): Promise<void> {
    const cs = await this.distributionLists.resolveRecipients('document', LISTA_CUSTOMER_SERVICE);
    const to = caso.comercialEmail ?? cs.to[0];
    if (!to) return;
    await this.enviarCorreo(caso, {
      to,
      cc: [...cs.to, ...cs.cc].filter((x) => x !== to),
      subject: `${caso.simulated ? '[SIMULADO] ' : ''}[Comercial] ${asunto}`,
      body: cuerpoHtml,
      enHilo: false,
    });
  }

  private evento(caso: ComercialCase, tipo: string, detalle: string, actor?: string | null): void {
    caso.eventos = [...(caso.eventos ?? []), { fecha: new Date().toISOString(), tipo, detalle, ...(actor ? { actor } : {}) }].slice(-MAX_EVENTOS);
  }
}

function lineaArg(l: CasoLinea) {
  return {
    codigoOben: l.codigoOben,
    descripcion: l.codigoCliente ?? l.textoCliente.slice(0, 120),
    kilos: l.kilos,
    anchoMm: l.anchoMm,
    espesorMicras: l.espesorMicras,
    precioUnitario: l.precioUnitario,
    moneda: l.moneda,
  };
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean))];
}

function parseFecha(v: string, campo: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BadRequestException(`${campo}: formato YYYY-MM-DD`);
  return new Date(`${v}T00:00:00.000Z`);
}

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export type { AccionPendienteTipo };
