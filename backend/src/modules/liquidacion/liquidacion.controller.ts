import { BadRequestException, Body, Controller, Delete, Get, Logger, Optional, Param, ParseIntPipe, ParseUUIDPipe, Post, Req, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { LiquidacionService } from './liquidacion.service';
import { LiquidacionCierreService } from './liquidacion-cierre.service';
import { CONCEPTOS_POR_INCOTERM } from './incoterm-rules';
import { proformaExcel } from './proforma-excel';
import { APROBACION_COMEX, LIBERAR_EXPORTACION, type LiberarExportacion, type TrasAprobacionComex } from './aprobacion-comex.token';
import type { LiquidacionDraft } from './liquidacion.types';
import type { LiquidacionFacturaInput, LiquidacionHeaderValues, LiquidacionLineValues, LiquidacionTotalesInput } from './liquidacion.types';

/** Soportes de un cambio de ruta: hasta 5 archivos de 10 MB (cotizaciones, correos, PDF). */
export const MAX_ADJUNTOS_RUTA = 5;
export const MAX_BYTES_ADJUNTO_RUTA = 10 * 1024 * 1024;

export const LIQUIDACION_PERMISSION = 'exportations.liquidate';
/** Consultar (perfil "Solo lectura" de Liquidación y Facturación, 22-oct): ver borradores, la proforma y el cierre sin cambiar nada. */
export const LIQUIDACION_CONSULTA_PERMISSION = 'exportations.read';
/** Aprobar la liquidación (COMEX): exigido para enviarla a Oben. */
export const LIQUIDACION_APROBAR_PERMISSION = 'exportations.approve';

/** COMEX escoge la ruta del tarifario: solo ids de tarifas, nunca montos. */
class LiquidacionRutaDto {
  @IsOptional()
  @IsUUID()
  maritimaId?: string | null;

  @IsOptional()
  @IsUUID()
  inlandId?: string | null;

  /** Fila de la pata 3 cuya comisión aduanera se usa (agente aduanero). */
  @IsOptional()
  @IsUUID()
  aduanaId?: string | null;

  /** Justificación (opcional, decisión de Hernán del 15-oct). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string | null;

  /** Lo que el usuario tiene en pantalla (Incoterm, encabezado) para recalcular igual. */
  @IsOptional()
  @IsObject()
  header?: LiquidacionHeaderValues;

  @IsOptional()
  @IsObject()
  totales?: LiquidacionTotalesInput;
}

class LiquidacionInputDto {
  @IsOptional()
  @IsObject()
  header?: LiquidacionHeaderValues;

  /** Incoterm, flete y otros gastos del envío completo, valor de la póliza. */
  @IsOptional()
  @IsObject()
  totales?: LiquidacionTotalesInput;

  @IsOptional()
  @IsObject()
  lines?: Record<string, LiquidacionLineValues>;

  /** Texto junto a la partida NCM en la factura (por cliente, 20-oct). */
  @IsOptional()
  @IsObject()
  factura?: LiquidacionFacturaInput;

  /** Sin `confirm: true` solo se simula: no se escribe nada en Oben. */
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;

  @IsOptional()
  @IsBoolean()
  resume?: boolean;

  @IsOptional()
  @IsBoolean()
  acknowledgeAmbiguous?: boolean;

  @IsOptional()
  @IsInt()
  @IsPositive()
  headId?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  detailsDone?: number[];
}

class DescartarDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string | null;
}

class CierreDto {
  /** Reenviar aunque ya se haya enviado el correo de cierre de esta PF. */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

/**
 * Consultar exige `exportations.read`; todo lo que cambia algo (ruta, adjuntos,
 * submit —que con `confirm:true` crea registros reales en el ERP de Oben—,
 * descartar, cierre) exige `exportations.liquidate`, y aprobar `exportations.approve`.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('liquidacion')
export class LiquidacionController {
  private readonly logger = new Logger(LiquidacionController.name);

  constructor(
    private readonly liquidacion: LiquidacionService,
    private readonly cierre: LiquidacionCierreService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  /** Qué conceptos pide cada Incoterm (misma tabla que usa el cálculo) — para la pantalla. */
  @Get('incoterms')
  @RequirePermission(LIQUIDACION_CONSULTA_PERMISSION)
  incoterms() {
    return Object.entries(CONCEPTOS_POR_INCOTERM).map(([codigo, conceptos]) => ({ codigo, conceptos }));
  }

  /** Borrador de solo lectura: consulta spCheckSettlement y muestra qué falta. */
  @Get(':numberPF/draft')
  @RequirePermission(LIQUIDACION_CONSULTA_PERMISSION)
  draft(@Param('numberPF') numberPF: string) {
    return this.liquidacion.getDraft(numberPF);
  }

  /** Igual que el borrador pero con los valores que digita el usuario (dirección, puertos, partidas, Incoterm, flete...). */
  @Post(':numberPF/draft')
  @RequirePermission(LIQUIDACION_CONSULTA_PERMISSION)
  draftWithInput(@Param('numberPF') numberPF: string, @Body() dto: LiquidacionInputDto) {
    return this.liquidacion.getDraft(numberPF, { header: dto.header, totales: dto.totales, lines: dto.lines, factura: dto.factura });
  }

  /**
   * COMEX aprueba los valores que ve en pantalla. Sin esta aprobación (vigente
   * para esos mismos valores) el envío real a Oben se rechaza.
   */
  @Post(':numberPF/approve')
  @RequirePermission(LIQUIDACION_APROBAR_PERMISSION)
  async approve(
    @Param('numberPF') numberPF: string,
    @Body() dto: LiquidacionInputDto,
    @Req() req: { user?: { email?: string; firstName?: string; lastName?: string } },
  ) {
    const u = req.user ?? {};
    const nombre = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email || null;
    const draft = await this.liquidacion.aprobar(numberPF, { header: dto.header, totales: dto.totales, lines: dto.lines, factura: dto.factura }, { nombre });
    // En segundo plano (Oben puede tardar hasta 90 s): COMEX no espera los correos ni la factura. Nunca tumba la aprobación.
    void trasAprobar(this.moduleRef, this.liquidacion, req, draft, nombre).catch((err: Error) => this.logger.error(`PF ${draft.numberPF}: lo que sigue a la aprobación falló: ${err.message}`));
    return draft;
  }

  /**
   * COMEX cambia la ruta (puerto, agente, naviera, transportador terrestre)
   * escogiendo tarifas del tarifario. Queda como orden de compra interna con
   * auditoría; ids en null = volver a la sugerida.
   */
  @Post(':numberPF/ruta')
  @RequirePermission(LIQUIDACION_PERMISSION)
  ruta(
    @Param('numberPF') numberPF: string,
    @Body() dto: LiquidacionRutaDto,
    @Req() req: { user?: { email?: string; firstName?: string; lastName?: string } },
  ) {
    const u = req.user ?? {};
    const nombre = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email || null;
    return this.liquidacion.cambiarRuta(
      numberPF,
      { maritimaId: dto.maritimaId, inlandId: dto.inlandId, aduanaId: dto.aduanaId, motivo: dto.motivo },
      { header: dto.header, totales: dto.totales },
      { nombre },
    );
  }

  /** Adjunta soportes (cotización, correo del booking…) a la justificación del cambio de ruta #numero (16-oct). */
  @Post(':numberPF/ruta/:numero/adjuntos')
  @RequirePermission(LIQUIDACION_PERMISSION)
  @UseInterceptors(FilesInterceptor('archivos', MAX_ADJUNTOS_RUTA, { limits: { fileSize: MAX_BYTES_ADJUNTO_RUTA } }))
  adjuntarRuta(
    @Param('numberPF') numberPF: string,
    @Param('numero', ParseIntPipe) numero: number,
    @UploadedFiles() archivos: Array<{ originalname: string; mimetype: string; size: number; buffer: Buffer }> | undefined,
  ) {
    if (!archivos?.length) throw new BadRequestException('Adjunta al menos un archivo (campo "archivos").');
    return this.liquidacion.adjuntarARuta(numberPF, numero, archivos);
  }

  /** Descarga un soporte de un cambio de ruta. */
  @Get(':numberPF/ruta/adjuntos/:id')
  @RequirePermission(LIQUIDACION_CONSULTA_PERMISSION)
  async adjuntoRuta(@Param('numberPF') numberPF: string, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const a = await this.liquidacion.adjuntoDeRuta(numberPF, id);
    res.setHeader('Content-Type', a.tipo);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(a.nombre)}`);
    res.send(a.contenido);
  }

  /** Simula por defecto; con `confirm:true` crea encabezado + detalles reales en Oben. */
  @Post(':numberPF/submit')
  @RequirePermission(LIQUIDACION_PERMISSION)
  submit(@Param('numberPF') numberPF: string, @Body() dto: LiquidacionInputDto) {
    return this.liquidacion.submit(
      numberPF,
      { header: dto.header, totales: dto.totales, lines: dto.lines, factura: dto.factura },
      {
        confirm: dto.confirm,
        resume: dto.resume,
        acknowledgeAmbiguous: dto.acknowledgeAmbiguous,
        headId: dto.headId,
        detailsDone: dto.detailsDone,
      },
    );
  }

  /** La proforma tal como la tiene Oben (encabezado, detalle y reporte COMEX), para revisarla antes de liquidar (20-oct). */
  @Get(':numberPF/proforma')
  @RequirePermission(LIQUIDACION_CONSULTA_PERMISSION)
  proforma(@Param('numberPF') numberPF: string) {
    return this.liquidacion.proformaCompleta(numberPF);
  }

  /** Excel de la proforma tal como la tiene Oben, para validar consignatario y detalles (María, 28-oct). Solo lectura. */
  @Get(':numberPF/proforma/excel')
  @RequirePermission(LIQUIDACION_CONSULTA_PERMISSION)
  async proformaExcel(@Param('numberPF') numberPF: string, @Res() res: Response) {
    const p = await this.liquidacion.proformaCompleta(numberPF);
    const buffer = await proformaExcel(p);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`Proforma-${p.numberPF}.xlsx`)}`);
    res.send(buffer);
  }

  /** COMEX ya la liquidó por fuera: sale de la lista de pendientes (20-oct). */
  @Post(':numberPF/descartar')
  @RequirePermission(LIQUIDACION_PERMISSION)
  descartar(
    @Param('numberPF') numberPF: string,
    @Body() dto: DescartarDto,
    @Req() req: { user?: { email?: string; firstName?: string; lastName?: string } },
  ) {
    const u = req.user ?? {};
    const nombre = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email || null;
    return this.liquidacion.descartarPendiente(numberPF, dto.motivo ?? null, { nombre });
  }

  /** La vuelve a poner en la lista de pendientes. */
  @Delete(':numberPF/descartar')
  @RequirePermission(LIQUIDACION_PERMISSION)
  restaurar(@Param('numberPF') numberPF: string) {
    return this.liquidacion.restaurarPendiente(numberPF);
  }

  /** Vista previa del correo de cierre (OBEN MAS §1.2): destinatarios, adjuntos, qué es simulado y si puede salir. No envía nada. */
  @Get(':numberPF/cierre')
  @RequirePermission(LIQUIDACION_CONSULTA_PERMISSION)
  cierrePreview(@Param('numberPF') numberPF: string) {
    return this.cierre.preview(numberPF);
  }

  /** Envía (o reintenta) el correo de cierre de una liquidación YA concluida en Oben. */
  @Post(':numberPF/cierre')
  @RequirePermission(LIQUIDACION_PERMISSION)
  cierreEnviar(@Param('numberPF') numberPF: string, @Body() dto: CierreDto) {
    return this.cierre.enviar(numberPF, { force: dto.force ?? false });
  }
}

/**
 * Al aprobar COMEX (Hernán, 23-oct): 1) salen los correos de Lista de Empaque de exportación que esperaban la
 * aprobación; 2) correo "Se realizó revisión de liquidación de COMEX"; 3) por separado, la factura con su aviso.
 * Fuera de la clase: el controlador solo expone rutas.
 */
async function trasAprobar(moduleRef: ModuleRef | undefined, liquidacion: LiquidacionService, req: object, draft: LiquidacionDraft, por: string | null): Promise<void> {
  if (!moduleRef) return;
  const logger = new Logger('LiquidacionController');
  const contextId = ContextIdFactory.getByRequest(req);
  const ovs = String(draft.ordenVenta ?? '')
    .split(/[\s,;/]+/)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const liberar = await moduleRef.resolve<LiberarExportacion>(LIBERAR_EXPORTACION, contextId, { strict: false }).catch(() => null);
  if (liberar && ovs.length) {
    const r = await liberar.liberarTrasAprobacionComex(ovs);
    logger.log(`PF ${draft.numberPF}: Listas de Empaque tras la aprobación de COMEX → ${r.map((x) => `OV ${x.ov}: ${x.resultado}`).join('; ')}`);
  }
  const tras = await moduleRef.resolve<TrasAprobacionComex>(APROBACION_COMEX, contextId, { strict: false }).catch(() => null);
  await tras?.procesar(draft, { por, huella: liquidacion.huellaDe(draft) });
}
