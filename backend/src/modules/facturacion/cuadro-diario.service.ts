import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { Tenant } from '../../entities/tenant.entity';
import { SharepointExcelService } from '../conexiones/sharepoint-excel.service';
import { CUADRO_HOJA, CUADRO_RANGO, FilaCuadro, aOrdenProgramada, filasDelDia } from './cuadro-diario';
import { FacturasParcialesService, fechaHoraBogota } from './facturas-parciales.service';

export interface CuadroDelDia {
  fecha: string;
  fuente: { archivo: string; hoja: string; encabezadoEnFila: number };
  filas: FilaCuadro[];
  incluidas: number;
  excluidas: number;
}

/**
 * Cuadro de facturación del día leído DIRECTO del Excel de SharePoint (antes llegaba como imagen). `ver` solo lee;
 * `cargar` lo guarda como programación del día pero NO factura nada (para facturar está el botón/proceso aparte,
 * y la facturación puede estar suspendida).
 */
@Injectable()
export class CuadroDiarioService {
  constructor(
    private readonly excel: SharepointExcelService,
    private readonly facturas: FacturasParcialesService,
    private readonly ctx: TenantContext,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
  ) {}

  async ver(fecha?: string): Promise<CuadroDelDia> {
    const dia = fecha ?? fechaHoraBogota(new Date()).fecha;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new BadRequestException('La fecha debe venir como AAAA-MM-DD.');
    const t = await this.tenants.findOne({ where: { id: this.ctx.tenantId } });
    const lista = ((t?.settings as Record<string, unknown> | undefined)?.facturacion as Record<string, unknown> | undefined)?.noFacturarOv;
    const noFacturar = Array.isArray(lista) ? lista.map(Number).filter(Number.isInteger) : [];
    let matriz: unknown[][];
    try {
      matriz = await this.excel.leerRango(CUADRO_HOJA, CUADRO_RANGO);
    } catch (err) {
      throw new BadRequestException(`No se pudo leer el Excel de SharePoint: ${(err as Error).message}`);
    }
    let r: ReturnType<typeof filasDelDia>;
    try {
      r = filasDelDia(matriz, dia, noFacturar);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    const incluidas = r.filas.filter((f) => f.incluida).length;
    return {
      fecha: dia,
      fuente: { archivo: 'SEGUIMIENTO DIARIO OBEN COLOMBIA.xlsx', hoja: CUADRO_HOJA, encabezadoEnFila: r.encabezadoEnFila },
      filas: r.filas,
      incluidas,
      excluidas: r.filas.length - incluidas,
    };
  }

  /** Guarda como programación del día las filas incluidas. REEMPLAZA la programación de ese día. No factura. */
  async cargar(fecha?: string) {
    const cuadro = await this.ver(fecha);
    if (cuadro.incluidas === 0) throw new BadRequestException(`El Excel no trae ninguna orden para facturar el ${cuadro.fecha}: no se cargó nada.`);
    const programadas = await this.facturas.programarDia(
      cuadro.fecha,
      cuadro.filas.filter((f) => f.incluida).map(aOrdenProgramada),
    );
    return { ...cuadro, cargadas: programadas.length, factura: false as const };
  }
}
