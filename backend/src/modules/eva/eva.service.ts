import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { Product } from '../../entities/product.entity';
import { Quote } from '../../entities/quote.entity';
import { Client } from '../../entities/client.entity';
import { Invoice } from '../../entities/invoice.entity';
import { FreightInlandRate } from '../../entities/freight-inland-rate.entity';
import { FreightDestinationSurcharge } from '../../entities/freight-destination-surcharge.entity';
import { QuotesService } from '../quotes/quotes.service';
import { FacturacionService } from '../facturacion/facturacion.service';
import { LiquidacionService } from '../liquidacion/liquidacion.service';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { findObenReport } from '../oben-reports/oben-report-registry';
import { OBEN_QUERY_OPTIONS } from '../oben-reports/oben-reports.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { AuthorizationService } from '../security/authorization.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import {
  MIA_DOCUMENTOS,
  MIA_PANTALLAS,
  MIA_TOOLS,
  permisoDocumento,
} from './mia-tools';

const WORKFLOW_NAME = 'eva-assistant';

/** Claude Haiku 4.5 (pedido de Hernán, 2026-10-01): rápido y barato para un asistente de consulta. */
export const MIA_MODEL = 'claude-haiku-4-5';
/** Cliente de Anthropic (null si falta ANTHROPIC_API_KEY); inyectable para pruebas. */
export const MIA_ANTHROPIC = Symbol('MIA_ANTHROPIC');
export type MiaAnthropicClient = Pick<Anthropic, 'messages'>;

/** Vueltas máximas de herramientas por pregunta (cada vuelta = una llamada al modelo). */
const MAX_VUELTAS = 6;
/** Turnos previos de la conversación que se le reenvían al modelo. */
const MAX_HISTORIAL = 20;
/** Tope de lo que se le devuelve al modelo por herramienta (los reportes de Oben pueden ser enormes). */
const MAX_RESULTADO = 12_000;

export interface MiaTurno {
  rol: 'usuario' | 'mia';
  texto: string;
}

/** Dónde está parado el usuario cuando escribe (para "esta orden", "esta pantalla"). */
export interface MiaContexto {
  ruta?: string;
  ov?: number;
}

/** Botones que MIA deja en el chat: descargar un documento o ir a una pantalla. */
export type MiaAccion =
  | { tipo: 'descargar'; documento: string; ov: number; etiqueta: string }
  | { tipo: 'navegar'; ruta: string; etiqueta: string };

export interface EvaChatResult {
  reply: string;
  action?: { type: string; data: unknown };
  acciones?: MiaAccion[];
}

interface ResultadoHerramienta {
  contenido: string;
  error?: boolean;
  /** crear_cotizacion: respuesta final armada desde el resultado real, no narrada por el modelo. */
  final?: EvaChatResult;
}

const SYSTEM_PROMPT = `Eres MIA, la asistente de Oben Xmart, la plataforma de operaciones y exportaciones de Oben Group (películas plásticas BOPP, BOPA, etc.), construida por Paradixe. Te escribe personal de Oben: comercial, COMEX, facturación y gerencia.

Glosario: OV = orden de venta (número entero, p. ej. 11187). PF = proforma (p. ej. 11366). COMEX = comercio exterior. Incoterm = DAP, DDP, CFR, CPT, FCA o FOB. Liquidación = cálculo de flete, seguro, otros gastos y valor FOB por línea de una proforma, que se envía al ERP de Oben.

Cómo trabajas:
- Tus herramientas consultan en vivo Oben Xmart y el ERP de Oben. Para cualquier dato concreto (facturas, órdenes, proformas, liquidaciones, reportes, tarifas de flete, cotizaciones, clientes, productos) consulta la herramienta adecuada antes de responder; no respondas de memoria.
- Nunca inventes cifras, fechas, clientes ni estados. Si una herramienta no trae el dato o falla, dilo y sugiere dónde verlo. Si un dato viene marcado como simulado o provisional, dilo explícitamente.
- Si el usuario dice "esta orden" o "esta pantalla", usa el contexto de pantalla que llega con su mensaje.
- Para documentos (PDF de factura, Excel de reportes de Oben) usa generar_documento: en el chat aparece un botón para descargarlo. Para llevar al usuario a una pantalla usa abrir_pantalla. Para reportes o resúmenes que te pidan, arma el texto tú misma con datos de las herramientas.
- crear_cotizacion crea una cotización real y se la envía al cliente: úsala solo si el usuario lo pide explícitamente para un cliente identificado por su correo.
- No puedes enviar facturas, enviar liquidaciones a Oben ni modificar datos. Si te lo piden, explica que se hace desde la pantalla correspondiente y ofrece abrirla.
- Estado actual de la facturación: Oben Xmart genera el borrador de factura en PDF y lo envía por correo a Facturación; la factura electrónica DIAN todavía no se emite de verdad (el CUFE es simulado) hasta integrar la API de facturación de Oben.

Idioma: responde SIEMPRE en el mismo idioma en que te escribe el usuario (español, inglés, portugués, chino o cualquier otro); si no es claro, en español. Los nombres de campos, clientes y productos que vienen de las herramientas se dejan tal cual.

Formato: tu respuesta se muestra en un chat pequeño que interpreta Markdown. Usa negritas, listas cortas y, solo si hay varias filas comparables, una tabla de pocas columnas. No uses títulos grandes (#) ni bloques de código para datos.

Responde breve y directo, como una colega experta. Fechas y horas en hora de Colombia, tal como vienen de las herramientas.`;

/**
 * MIA: asistente de Oben Xmart sobre Claude Haiku (Anthropic) con
 * herramientas de consulta reales. Cada herramienta exige el mismo permiso
 * que su pantalla/endpoint equivalente, así que MIA nunca le muestra a un
 * usuario lo que su rol no le deja ver. Las acciones con efecto fuera del
 * sistema se limitan a `crear_cotizacion` (mismo camino ya probado que un
 * correo real) y su respuesta se arma desde el resultado real, no desde lo
 * que el modelo "narre".
 */
@Injectable()
export class EvaService {
  private readonly logger = new Logger(EvaService.name);

  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Quote) private readonly quotes: Repository<Quote>,
    @InjectRepository(Client) private readonly clients: Repository<Client>,
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    @InjectRepository(FreightInlandRate)
    private readonly inland: Repository<FreightInlandRate>,
    @InjectRepository(FreightDestinationSurcharge)
    private readonly surcharges: Repository<FreightDestinationSurcharge>,
    private readonly quotesService: QuotesService,
    private readonly facturacion: FacturacionService,
    private readonly liquidacion: LiquidacionService,
    private readonly hub: IntegrationHubService,
    private readonly authz: AuthorizationService,
    private readonly ctx: TenantContext,
    private readonly audit: WorkflowAuditService,
    @Optional()
    @Inject(MIA_ANTHROPIC)
    private readonly anthropic: MiaAnthropicClient | null = null,
  ) {}

  async chat(
    message: string,
    historial: MiaTurno[] = [],
    contexto: MiaContexto = {},
  ): Promise<EvaChatResult> {
    const herramientas: Array<{ nombre: string; input: unknown; ok: boolean }> =
      [];
    const result = this.anthropic
      ? await this.conversar(
          this.anthropic,
          message,
          historial,
          contexto,
          herramientas,
        )
      : {
          reply:
            'MIA no está configurada todavía en este ambiente (falta ANTHROPIC_API_KEY). Avisa al equipo técnico.',
        };

    // Auditoría de TODA interacción: qué se le pidió, qué herramientas usó y
    // el resultado real.
    await this.audit.log({
      workflowName: WORKFLOW_NAME,
      eventType: WorkflowEventType.ACTION_EXECUTED,
      action: result.action?.type ?? 'eva_reply',
      entityType: 'eva_interaction',
      entityId: this.ctx.userId ?? 'unknown',
      actorId: this.ctx.userId,
      inputData: { message, contexto, turnosPrevios: historial.length },
      outputData: {
        reply: result.reply,
        action: result.action ?? null,
        acciones: result.acciones ?? [],
        herramientas,
        modelo: MIA_MODEL,
      },
    });
    return result;
  }

  private async conversar(
    client: MiaAnthropicClient,
    message: string,
    historial: MiaTurno[],
    contexto: MiaContexto,
    herramientas: Array<{ nombre: string; input: unknown; ok: boolean }>,
  ): Promise<EvaChatResult> {
    const messages: Anthropic.MessageParam[] = [
      ...this.historialComoMensajes(historial),
      {
        role: 'user',
        content: [
          { type: 'text', text: message },
          { type: 'text', text: this.contextoTexto(contexto) },
        ],
      },
    ];
    const acciones: MiaAccion[] = [];

    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      let resp: Anthropic.Message;
      try {
        resp = await client.messages.create({
          model: MIA_MODEL,
          max_tokens: 16000,
          system: [
            {
              type: 'text',
              text: SYSTEM_PROMPT,
              cache_control: { type: 'ephemeral' },
            },
          ],
          tools: MIA_TOOLS.map((t) => t.tool),
          messages,
        });
      } catch (err) {
        return { reply: this.mensajeError(err), acciones };
      }

      if (resp.stop_reason === 'refusal') {
        return { reply: 'No puedo ayudarte con esa solicitud.', acciones };
      }
      const texto = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      const llamadas = resp.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      if (resp.stop_reason !== 'tool_use' || llamadas.length === 0) {
        const cortada =
          resp.stop_reason === 'max_tokens'
            ? '\n\n(La respuesta quedó incompleta por su longitud; pídeme la parte que falta.)'
            : '';
        return {
          reply: (texto || 'No tengo una respuesta para eso.') + cortada,
          acciones,
        };
      }

      messages.push({ role: 'assistant', content: resp.content });
      // En paralelo, pero los botones quedan en el orden en que el modelo pidió las herramientas.
      const porLlamada = llamadas.map(() => [] as MiaAccion[]);
      const resultados = await Promise.all(
        llamadas.map((l, i) => this.ejecutar(l.name, l.input, porLlamada[i])),
      );
      llamadas.forEach((l, i) =>
        herramientas.push({
          nombre: l.name,
          input: l.input,
          ok: !resultados[i].error,
        }),
      );
      acciones.push(...porLlamada.flat());

      const final = resultados.find((r) => r.final)?.final;
      if (final) return { ...final, acciones };

      messages.push({
        role: 'user',
        content: llamadas.map((l, i) => ({
          type: 'tool_result' as const,
          tool_use_id: l.id,
          content: resultados[i].contenido,
          ...(resultados[i].error ? { is_error: true } : {}),
        })),
      });
    }
    return {
      reply:
        'Esta consulta necesitó demasiados pasos. ¿Puedes hacerla más específica (por ejemplo, con el número de OV o PF)?',
      acciones,
    };
  }

  /** Turnos previos como mensajes de la API: siempre empieza por el usuario (el saludo inicial de MIA se omite). */
  private historialComoMensajes(
    historial: MiaTurno[],
  ): Anthropic.MessageParam[] {
    const turnos = historial
      .filter((t) => t.texto?.trim())
      .slice(-MAX_HISTORIAL);
    const primero = turnos.findIndex((t) => t.rol === 'usuario');
    if (primero < 0) return [];
    return turnos.slice(primero).map((t) => ({
      role: t.rol === 'usuario' ? 'user' : 'assistant',
      content: t.texto,
    }));
  }

  private contextoTexto(contexto: MiaContexto): string {
    const partes = [`fecha y hora: ${fechaCo(new Date())} (hora de Colombia)`];
    if (contexto.ruta)
      partes.push(
        `pantalla: ${MIA_PANTALLAS[contexto.ruta] ?? contexto.ruta} (${contexto.ruta})`,
      );
    if (contexto.ov) partes.push(`OV cargada en pantalla: ${contexto.ov}`);
    return `[Contexto — ${partes.join(' · ')}]`;
  }

  private mensajeError(err: unknown): string {
    const status = err instanceof Anthropic.APIError ? Number(err.status) : undefined;
    this.logger.error(
      `Anthropic falló (${status ?? 'sin status'}): ${(err as Error).message}`,
    );
    if (
      err instanceof Anthropic.AuthenticationError ||
      err instanceof Anthropic.PermissionDeniedError
    ) {
      return 'MIA no pudo autenticarse con Anthropic (la clave de API no es válida o no tiene acceso). Avisa al equipo técnico.';
    }
    if (err instanceof Anthropic.RateLimitError) {
      return 'MIA está recibiendo demasiadas consultas en este momento. Intenta de nuevo en unos segundos.';
    }
    if (err instanceof Anthropic.BadRequestError) {
      return 'Anthropic rechazó la consulta de MIA (puede ser saldo insuficiente en la cuenta). Avisa al equipo técnico.';
    }
    return 'MIA no pudo conectarse al modelo de IA en este momento. Intenta de nuevo en un momento.';
  }

  private async permitido(permiso: string): Promise<boolean> {
    const userId = this.ctx.userId;
    if (!userId) return false;
    const decision = await this.authz.can({
      subject: {
        userId,
        tenantId: this.ctx.tenantIdOrNull,
        isSuperAdmin: this.ctx.isSuperAdmin,
      },
      permission: permiso,
      context: { route: '/eva/chat', method: 'POST' },
    });
    return decision.effect === 'allow';
  }

  private async ejecutar(
    nombre: string,
    input: unknown,
    acciones: MiaAccion[],
  ): Promise<ResultadoHerramienta> {
    const def = MIA_TOOLS.find((t) => t.tool.name === nombre);
    if (!def)
      return {
        contenido: `La herramienta "${nombre}" no existe.`,
        error: true,
      };
    const args = (input && typeof input === 'object' ? input : {}) as Record<
      string,
      unknown
    >;
    const permiso =
      def.permiso ??
      (nombre === 'generar_documento'
        ? permisoDocumento(String(args.documento))
        : null);
    if (permiso && !(await this.permitido(permiso))) {
      return {
        contenido: `El usuario no tiene el permiso "${permiso}" para esta consulta. Díselo y no insistas.`,
        error: true,
      };
    }
    try {
      const salida = await this.correr(nombre, args, acciones);
      if ('final' in salida || 'contenido' in salida)
        return salida as ResultadoHerramienta;
      return { contenido: recortar(JSON.stringify(salida)) };
    } catch (err) {
      this.logger.warn(
        `Herramienta ${nombre} falló: ${(err as Error).message}`,
      );
      return {
        contenido: `Falló la consulta: ${(err as Error).message}`,
        error: true,
      };
    }
  }

  private async correr(
    nombre: string,
    a: Record<string, unknown>,
    acciones: MiaAccion[],
  ): Promise<object> {
    const tenantId = this.ctx.tenantId;
    const lim = limite(a.limite);
    switch (nombre) {
      case 'ultimas_facturas': {
        const [envios, emitidas, facturas] = await Promise.all([
          this.audit.listByAction('facturacion_enviada', lim),
          this.audit.listByAction('facturacion_dian_emitida', lim),
          this.invoices.find({
            where: { tenantId },
            order: { createdAt: 'DESC' },
            take: lim,
          }),
        ]);
        return {
          enviosDeFactura: envios.map((e) => {
            const o = e.outputData ?? {};
            return {
              fecha: fechaCo(e.createdAt),
              ov: e.entityId,
              cliente: o.cliente ?? null,
              enviado: o.ok !== false,
              para: o.to ?? [],
              cc: o.cc ?? [],
              cufe: o.cufe ?? null,
              cufeSimulado: o.cufeSimulado !== false,
              error: e.reason ?? null,
            };
          }),
          facturasElectronicas: emitidas.map((e) => ({
            fecha: fechaCo(e.createdAt),
            ov: e.entityId,
            numero: e.outputData?.invoiceNumber ?? null,
            cufe: e.outputData?.cufe ?? null,
            simulada: e.outputData?.simulated !== false,
          })),
          moduloFacturas: facturas.map((f) => ({
            numero: f.invoiceNumber,
            fecha: fechaCo(f.createdAt),
            total: Number(f.totalAmount),
            estado: f.status,
            dian: f.dianStatus,
            cufe: f.dianCufe ?? null,
          })),
        };
      }
      case 'ordenes_recientes':
        return {
          ordenes: (await this.facturacion.ordenesRecientes(lim)).map((o) => ({
            ...o,
            fecha: fechaCo(o.fecha),
          })),
        };
      case 'consultar_facturacion_orden': {
        const n = entero(a.ov, 'ov');
        const [borrador, historial] = await Promise.all([
          this.facturacion.getDraft(n),
          this.facturacion.historial(n),
        ]);
        return {
          borrador,
          historial: {
            ...historial,
            envios: historial.envios.map((e) => ({
              ...e,
              fecha: fechaCo(e.fecha),
            })),
          },
        };
      }
      case 'consultar_liquidacion':
        return await this.liquidacion.getDraft(texto(a.pf, 'pf'));
      case 'consultar_reporte_oben': {
        const def = findObenReport(texto(a.reporte, 'reporte'));
        if (!def) throw new Error(`Reporte "${String(a.reporte)}" no existe`);
        const n = entero(a.ov, 'ov');
        const r = await this.hub.call(
          'obenCostOrder',
          'query.run',
          { procedure: def.procedure, numberOrderSales: n },
          OBEN_QUERY_OPTIONS,
        );
        if (!r.ok) throw new Error(r.error ?? 'Oben no respondió');
        return {
          reporte: def.label,
          ov: n,
          simulado: r.mode === 'mock',
          datos: r.data,
        };
      }
      case 'tarifas_flete': {
        const qb = this.inland
          .createQueryBuilder('r')
          .where('r.tenantId = :tenantId', { tenantId });
        if (a.pais === 'USA' || a.pais === 'CA')
          qb.andWhere('r.country = :pais', { pais: a.pais });
        const buscar = textoOpc(a.buscar);
        if (buscar) {
          qb.andWhere(
            '(r.destinationPort ILIKE :q OR r.destinationAddress ILIKE :q OR r.state ILIKE :q)',
            { q: `%${sinComodines(buscar)}%` },
          );
        }
        const [inland, total] = await qb
          .orderBy('r.rate40hc', 'ASC')
          .take(15)
          .getManyAndCount();
        const origen = textoOpc(a.origen) ?? 'Colombia';
        const recargos = await this.surcharges.find({
          where: { tenantId, country: ILike(sinComodines(origen)) },
        });
        const hoy = new Date().toISOString().slice(0, 10);
        return {
          inlandFreight: inland.map((r) => ({
            pais: r.country,
            forwarder: r.forwarder,
            puertoDestino: r.destinationPort,
            estado: r.state,
            direccion: r.destinationAddress,
            valor40HC_USD: Number(r.rate40hc),
            transitoDias: r.transitTimeDays,
            vigenteHasta: r.validUntil,
            vencida: !!r.validUntil && r.validUntil < hoy,
          })),
          totalCoincidencias: total,
          recargosDestino: {
            origen,
            items: recargos.map((s) => ({
              nombre: s.surchargeName,
              valorUSD: s.rateAmount === null ? null : Number(s.rateAmount),
              formula: s.rateFormula,
            })),
          },
          nota: 'La tabla no incluye flete marítimo.',
        };
      }
      case 'consultar_cotizaciones': {
        const buscar = textoOpc(a.buscar);
        const q = buscar ? ILike(`%${sinComodines(buscar)}%`) : undefined;
        const where: FindOptionsWhere<Quote>[] = q
          ? [
              { tenantId, quoteNumber: q },
              { tenantId, client: { name: q } },
            ]
          : [{ tenantId }];
        const quotes = await this.quotes.find({
          where,
          relations: { client: true },
          order: { createdAt: 'DESC' },
          take: lim,
        });
        return {
          cotizaciones: quotes.map((c) => ({
            numero: c.quoteNumber,
            cliente: c.client?.name ?? null,
            totalCOP: Number(c.total),
            estado: c.status,
            fecha: fechaCo(c.createdAt),
            ordenNumero: c.orderNumber,
            factura: c.invoiceNumber ?? null,
          })),
        };
      }
      case 'consultar_clientes': {
        const buscar = textoOpc(a.buscar);
        const q = buscar ? ILike(`%${sinComodines(buscar)}%`) : undefined;
        const where: FindOptionsWhere<Client>[] = q
          ? [
              { tenantId, name: q },
              { tenantId, obenCode: q },
              { tenantId, email: q },
            ]
          : [{ tenantId }];
        const clientes = await this.clients.find({
          where,
          order: { name: 'ASC' },
          take: lim,
        });
        return {
          clientes: clientes.map((c) => ({
            nombre: c.name,
            codigoOben: c.obenCode,
            correo: c.email,
            dominios: c.authorizedDomains,
            cupoCredito: Number(c.creditLimit),
            creditoUsado: Number(c.usedCredit),
            activo: c.isActive,
          })),
        };
      }
      case 'consultar_productos': {
        const buscar = textoOpc(a.buscar);
        const q = buscar ? ILike(`%${sinComodines(buscar)}%`) : undefined;
        const base = { tenantId, isActive: true };
        const where: FindOptionsWhere<Product>[] = q
          ? [
              { ...base, sku: q },
              { ...base, name: q },
            ]
          : [base];
        const productos = await this.products.find({
          where,
          order: { name: 'ASC' },
          take: limite(a.limite, 30),
        });
        return {
          productos: productos.map((p) => ({
            sku: p.sku,
            nombre: p.name,
            precioCOPporKg: Number(p.price),
            inventario: Number(p.stock),
          })),
        };
      }
      case 'generar_documento': {
        const documento = texto(a.documento, 'documento');
        if (!MIA_DOCUMENTOS[documento])
          throw new Error(`Documento "${documento}" no existe`);
        const n = entero(a.ov, 'ov');
        const etiqueta = `${MIA_DOCUMENTOS[documento]} — OV ${n}`;
        acciones.push({ tipo: 'descargar', documento, ov: n, etiqueta });
        return {
          contenido: `Listo: en el chat aparece el botón "${etiqueta}". El archivo se genera al pulsarlo, con los datos vigentes de Oben.`,
        };
      }
      case 'abrir_pantalla': {
        const ruta = texto(a.ruta, 'ruta');
        if (!MIA_PANTALLAS[ruta])
          throw new Error(`Pantalla "${ruta}" no existe`);
        const n =
          ruta === '/facturacion' && a.ov !== undefined
            ? entero(a.ov, 'ov')
            : null;
        const etiqueta = `Abrir ${MIA_PANTALLAS[ruta]}${n ? ` (OV ${n})` : ''}`;
        acciones.push({
          tipo: 'navegar',
          ruta: n ? `${ruta}?ov=${n}` : ruta,
          etiqueta,
        });
        return {
          contenido: `Listo: en el chat aparece el botón "${etiqueta}".`,
        };
      }
      case 'crear_cotizacion':
        return this.crearCotizacion(
          texto(a.clienteEmail, 'clienteEmail'),
          texto(a.descripcionPedido, 'descripcionPedido'),
        );
      default:
        throw new Error(`Herramienta "${nombre}" sin implementar`);
    }
  }

  private async crearCotizacion(
    clienteEmail: string,
    descripcionPedido: string,
  ): Promise<ResultadoHerramienta> {
    const result = await this.quotesService.processIncomingEmail({
      from: clienteEmail,
      subject: 'Solicitud vía MIA',
      body: descripcionPedido,
    });
    let final: EvaChatResult;
    if (result.outcome === 'quoted' && result.quote) {
      final = {
        reply: `Listo — generé la cotización ${result.quote.quoteNumber} por $${Number(result.quote.total).toLocaleString('es-CO')} COP para ${clienteEmail}. El PDF ya se envió al cliente por correo.`,
        action: {
          type: 'quote_created',
          data: {
            quoteNumber: result.quote.quoteNumber,
            total: result.quote.total,
          },
        },
      };
    } else if (result.outcome === 'rejected_unknown_client') {
      final = {
        reply: `No pude generar la cotización: "${clienteEmail}" no pertenece a ningún cliente registrado y activo en Oben Xmart.`,
      };
    } else if (result.outcome === 'insufficient_info') {
      final = {
        reply: `Identifiqué al cliente, pero no reconocí ningún producto del catálogo en "${descripcionPedido}". ¿Puedes indicarme el SKU o el nombre del producto?`,
      };
    } else {
      final = {
        reply:
          result.message ||
          'Procesé la solicitud, pero el resultado no fue claro. Revisa la pantalla de Cotizaciones.',
      };
    }
    return { contenido: final.reply, final };
  }
}

/** Fecha y hora en Colombia, p. ej. "1 oct 2026, 10:32 a. m.". */
export function fechaCo(d: Date | string): string {
  return new Date(d).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function recortar(s: string): string {
  return s.length <= MAX_RESULTADO
    ? s
    : `${s.slice(0, MAX_RESULTADO)}… [recortado: el resultado completo tiene ${s.length} caracteres]`;
}

function limite(v: unknown, porDefecto = 10): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, 50) : porDefecto;
}

function entero(v: unknown, campo: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0)
    throw new Error(`"${campo}" debe ser un número entero positivo`);
  return n;
}

function texto(v: unknown, campo: string): string {
  const s = textoOpc(v);
  if (!s) throw new Error(`Falta "${campo}"`);
  return s;
}

function textoOpc(v: unknown): string | undefined {
  if (typeof v === 'number') return String(v);
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** El texto del usuario/modelo va dentro de un LIKE: sus % y _ se escapan. */
function sinComodines(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
