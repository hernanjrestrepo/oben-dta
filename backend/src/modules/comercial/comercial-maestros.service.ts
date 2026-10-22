import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { APIS_COMERCIALES, esMaestroComercial, type MaestroComercial } from '../integrations/hub/adapters/oben-comercial';

/** Los maestros cambian poco y el de referencias pesa ~3,6 MB: se guardan una hora por tenant. */
const CACHE_MS = 60 * 60 * 1000;
const OPCIONES = { maxAttempts: 1, timeoutMs: 90_000 };
type Fila = Record<string, unknown>;

export interface MaestroResultado {
  maestro: MaestroComercial;
  descripcion: string;
  /** true = datos de ejemplo del simulador (Oben no conectado en este entorno). */
  simulado: boolean;
  total: number;
  items: Fila[];
  consultadoEn: string;
}

const normalizar = (t: unknown) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();

/**
 * Maestros comerciales de Oben (clientes, referencias, partidas, ciudades) y las dos consultas con parámetros
 * (validación de empaque, parametrización cliente-destino). Hoy salen del servidor de PRUEBAS de Oben (ver
 * oben-comercial.ts). Solo lectura.
 */
@Injectable()
export class ComercialMaestrosService {
  private readonly logger = new Logger(ComercialMaestrosService.name);
  private readonly cache = new Map<string, { hasta: number; filas: Fila[]; simulado: boolean; en: string }>();

  constructor(
    private readonly hub: IntegrationHubService,
    private readonly ctx: TenantContext,
  ) {}

  catalogo() {
    return Object.entries(APIS_COMERCIALES).map(([maestro, d]) => ({ maestro, api: d.api, descripcion: d.descripcion, parametros: Object.keys(d.parametros) }));
  }

  async maestro(nombre: string, opciones: { buscar?: string; limite?: number; refrescar?: boolean } = {}): Promise<MaestroResultado> {
    if (!esMaestroComercial(nombre) || Object.keys(APIS_COMERCIALES[nombre].parametros).length > 0) {
      throw new BadRequestException(`"${nombre}" no es un maestro. Maestros: clientes, productos, partidas, ciudades.`);
    }
    const datos = await this.filas(nombre, !!opciones.refrescar);
    const q = normalizar(opciones.buscar).trim();
    const filtradas = q ? datos.filas.filter((f) => Object.values(f).some((v) => normalizar(v).includes(q))) : datos.filas;
    const limite = Math.min(Math.max(Number(opciones.limite) || 100, 1), 1000);
    return {
      maestro: nombre,
      descripcion: APIS_COMERCIALES[nombre].descripcion,
      simulado: datos.simulado,
      total: filtradas.length,
      items: filtradas.slice(0, limite),
      consultadoEn: datos.en,
    };
  }

  /**
   * ¿La referencia tiene Maestro de Empaque para ese cliente y su destino? Oben responde HTTP 200 en los dos casos:
   * "OK" si existe, o un texto como "No se encontró Maestro de Empaque para el producto seleccionado y su destino".
   */
  async validarEmpaque(p: { codSecEntity: number; codSecEntityAddress: number; codSecProduct: number; codSecCity: number }) {
    for (const [k, v] of Object.entries(p)) {
      if (!Number.isInteger(v) || v <= 0) throw new BadRequestException(`Falta ${k} (número entero).`);
    }
    const r = await this.hub.call<unknown>('obenCostOrder', 'comercial.consultar', { maestro: 'validarEmpaque', parametros: p }, OPCIONES);
    if (!r.ok) throw new BadRequestException(`Oben no respondió la validación de empaque: ${r.error ?? 'sin detalle'}`);
    const texto = (typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '')).replace(/^"|"$/g, '').trim();
    return { valido: /^ok$/i.test(texto), mensaje: /^ok$/i.test(texto) ? 'La referencia tiene Maestro de Empaque para ese destino.' : texto, simulado: r.mode === 'mock' };
  }

  /**
   * Parametrización cliente-destino (APICustomerParameterizationParadixe). José, 22-oct: `TargetCustomer` es el campo
   * `Target_Customer` del maestro de clientes (antes `Cliente_Destino`), tal cual, y `CodSecEntity` el `CodSec_Entity`.
   * Devuelve la condición comercial, moneda, Incoterm, puerto, etiquetas, notas y correos que Comercial dejó definidos.
   */
  async parametrizacion(p: { codSecEntity: number; targetCustomer: string }) {
    if (!Number.isInteger(p.codSecEntity) || p.codSecEntity <= 0) throw new BadRequestException('Falta codSecEntity (número entero).');
    if (!p.targetCustomer?.trim()) throw new BadRequestException('Falta targetCustomer.');
    const r = await this.hub.call<unknown>('obenCostOrder', 'comercial.consultar', { maestro: 'parametrizacion', parametros: p }, OPCIONES);
    if (!r.ok) {
      throw new BadRequestException(
        `Oben no devolvió la parametrización de ese cliente y destino: ${r.error ?? 'sin detalle'}. Revisa que el destino sea exactamente el Target_Customer del cliente (incluido el punto final, p. ej. "ALADDIN PACKAGING LLC.").`,
      );
    }
    let data: unknown = r.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        data = null;
      }
    }
    const fila = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
    return { datos: fila && typeof fila === 'object' ? fila : null, simulado: r.mode === 'mock' };
  }

  private async filas(nombre: MaestroComercial, refrescar: boolean) {
    const clave = `${this.ctx.tenantId}:${nombre}`;
    const c = this.cache.get(clave);
    if (c && !refrescar && c.hasta > Date.now()) return c;
    const r = await this.hub.call<unknown>('obenCostOrder', 'comercial.consultar', { maestro: nombre }, OPCIONES);
    if (!r.ok) throw new BadRequestException(`Oben no respondió el ${APIS_COMERCIALES[nombre].descripcion.toLowerCase()}: ${r.error ?? 'sin detalle'}`);
    let data = r.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        data = [];
      }
    }
    const filas = (Array.isArray(data) ? data : []).filter((x): x is Fila => !!x && typeof x === 'object');
    const nuevo = { hasta: Date.now() + CACHE_MS, filas, simulado: r.mode === 'mock', en: new Date().toISOString() };
    this.cache.set(clave, nuevo);
    this.logger.log(`Maestro ${nombre}: ${filas.length} registros de Oben${nuevo.simulado ? ' (SIMULADO)' : ''}.`);
    return nuevo;
  }
}
