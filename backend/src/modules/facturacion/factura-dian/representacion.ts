import type { FacturaElectronica, FacturacionDraft } from '../facturacion.types';
import type { LiquidacionDraft } from '../../liquidacion/liquidacion.types';
import { EMISOR_OBEN, FAMILIA_PELICULA, RESOLUCIONES_DIAN } from './emisor';
import { PARTIDAS, partidaComun, type PartidaArancelaria } from '../../liquidacion/partidas-arancelarias';
import { valorEnLetras, valueInWords } from './letras';
import type { FacturaDian, FacturaDianLinea, TipoFacturaDian } from './factura-dian.types';

/** IVA de la venta nacional de película (las facturas reales de Oben llevan 19 %). */
export const IVA_NACIONAL_PCT = 19;

export interface ClienteMaestro {
  nit?: string | null;
  correo?: string | null;
  telefono?: string | null;
  direccion?: string | null;
}

export interface DatosFacturaDian {
  draft: FacturacionDraft;
  factura: FacturaElectronica | null;
  /** Exportación: la liquidación de la PF (precio FOB por kilo, flete, seguro, otros, partidas, puertos, Incoterm). */
  liquidacion?: LiquidacionDraft | null;
  /** Exportación: TRM oficial del día de la factura (datos.gov.co). */
  trm?: { valor: number; fecha: string } | null;
  cliente?: ClienteMaestro | null;
  ahora?: Date;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const enUS = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Partes de una fecha en hora de Colombia. */
function partesBogota(d: Date) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t: string) => f.find((x) => x.type === t)?.value ?? '00';
  return { y: g('year'), m: g('month'), d: g('day'), h: Number(g('hour')), mi: g('minute'), s: g('second') };
}

/** FV: "2026-07-27 16:35:17-05:00"; FEXP: "2026-09-30 05:36 PM" (formatos de Facture). */
export function fechaEmisionTxt(tipo: TipoFacturaDian, d: Date): string {
  const p = partesBogota(d);
  if (tipo === 'nacional') return `${p.y}-${p.m}-${p.d} ${String(p.h).padStart(2, '0')}:${p.mi}:${p.s}-05:00`;
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${p.y}-${p.m}-${p.d} ${String(h12).padStart(2, '0')}:${p.mi} ${p.h < 12 ? 'AM' : 'PM'}`;
}

/**
 * Descripción comercial a partir del código de material de Oben
 * ("SC---0030TN0405S0760" → "OPP SEAL FILM SC30 TN X 405 MM Diámetro 760").
 * Lo que no se puede leer del código (p. ej. "Core 6") no se inventa.
 */
export function descripcionMaterial(codigo: string): string {
  const m = codigo.match(/^([A-Z]+)-*(\d{2,4})([A-Z]+)(\d{4})S(\d{4})$/);
  if (!m) return codigo;
  const [, familia, micras, tipo, ancho, diametro] = m;
  const nombre = FAMILIA_PELICULA[familia];
  return `${nombre ? `${nombre} ` : ''}${familia}${Number(micras)} ${tipo} X ${Number(ancho)} MM Diámetro ${Number(diametro)}`;
}

/**
 * Descripción de la partida para las observaciones. Primero la de los
 * materiales (BOPP y BOPP metalizado comparten 3920.20.19 pero se describen
 * distinto); si no se sabe el tipo, solo cuando la partida identifica UN tipo.
 */
export function descripcionPartida(ncm: string | null, codigos: string[]): PartidaArancelaria | null {
  if (!ncm) return null;
  const porMaterial = partidaComun(codigos).partida;
  if (porMaterial && porMaterial.ncm === ncm) return porMaterial;
  const candidatas = Object.values(PARTIDAS).filter((p) => p.ncm === ncm);
  return candidatas.length === 1 ? candidatas[0] : null;
}

/** "2144 FRENCH SETTLEMENT RD, Dallas TX 75212, USA" → "Dallas" (la ciudad, sin estado ni código postal). */
export function ciudadDeDireccion(direccion: string | null): string | null {
  const partes = (direccion ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  if (partes.length < 3) return null;
  const c = partes[partes.length - 2].replace(/\s+[A-Z]{2}\s+\d{5}(-\d{4})?$/, '').replace(/\s+\d{5}(-\d{4})?$/, '').trim();
  return c || null;
}

/** Contenido del QR como lo arma Facture (NumFac, FecFac, HorFac, …, CUFE y URL de consulta en la DIAN). */
export function contenidoQr(f: Omit<FacturaDian, 'qr'>, emision: Date, trm: number | null): string {
  const p = partesBogota(emision);
  const aCop = (v: number) => (f.moneda === 'USD' && trm ? v * trm : v);
  const dec2 = (v: number) => aCop(v).toFixed(2);
  const iva = aCop(f.iva);
  const cufe = f.cufe ?? '';
  return [
    `NumFac: ${f.numero ?? ''} `,
    `FecFac: ${p.y}${p.m}${p.d}`,
    `HorFac: ${String(p.h).padStart(2, '0')}:${p.mi}:${p.s}-05:00`,
    `NitFac: ${EMISOR_OBEN.nitSinDv}`,
    `DocAdq: ${f.cliente.nit ?? ''}`,
    `ValFac: ${dec2(f.subtotal)}`,
    `ValIva: ${Number.isInteger(iva) ? iva : iva.toFixed(2)}`,
    'ValOtroIm: 0.00',
    `ValTolFac: ${dec2(f.subtotal + f.iva)}`,
    `CUFE: ${cufe}`,
    `QRCode: https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cufe}`,
  ].join('\n');
}

/**
 * Arma la factura (FV o FEXP) con los datos reales que ya tiene el sistema.
 * Devuelve también los avisos de lo que todavía no tiene fuente (sale en
 * blanco en el documento, igual que en las facturas reales cuando falta).
 */
export function construirFacturaDian(datos: DatosFacturaDian): { factura: FacturaDian; avisos: string[] } {
  const { draft, factura, liquidacion, trm, cliente } = datos;
  const ahora = datos.ahora ?? new Date();
  const tipo: TipoFacturaDian = draft.kind === 'exportacion' ? 'exportacion' : 'nacional';
  const exportacion = tipo === 'exportacion';
  const resolucion = RESOLUCIONES_DIAN[tipo];
  const moneda = exportacion ? 'USD' : 'COP';
  const avisos: string[] = [];
  const hoy = ahora.toISOString().slice(0, 10);
  if (resolucion.vigenteHasta < hoy) {
    avisos.push(`La resolución DIAN de facturación ${tipo} (${resolucion.numero}) venció el ${resolucion.vigenteHasta}: pedir a Oben la vigente.`);
  }

  // Precio por kilo: en exportación, el precio final de la liquidación (FOB por kilo); si no, el negociado.
  const precioDe = (codigo: string): number | null => {
    if (exportacion && liquidacion) {
      const l = liquidacion.lines.find((x) => codigo.startsWith(x.tipoPelicula));
      if (l && isNum(l.kilosTotalUnit)) return l.kilosTotalUnit;
    }
    const d = draft.lines.find((x) => codigo.startsWith(x.tipoPelicula));
    return d && isNum(d.precio) ? d.precio : null;
  };
  if (exportacion && !liquidacion) {
    avisos.push('Sin liquidación de la PF: los precios son los negociados y flete/seguro van en 0 (la factura de exportación lleva el precio FOB de la liquidación).');
  }

  const ivaPct = exportacion ? 0 : IVA_NACIONAL_PCT;
  const items = draft.empaque?.items.length
    ? draft.empaque.items.map((i) => ({ codigo: i.codigo, descripcion: descripcionMaterial(i.codigo), cantidad: i.kilos }))
    : draft.lines.map((l) => ({ codigo: l.tipoPelicula, descripcion: descripcionMaterial(l.tipoPelicula), cantidad: l.kilosTotal }));
  const sinPrecio = new Set<string>();
  const lineas: FacturaDianLinea[] = items.map((it, i) => {
    const precio = precioDe(it.codigo);
    if (precio === null) sinPrecio.add(it.codigo);
    const valorUnitario = precio ?? 0;
    const total = round2(it.cantidad * valorUnitario);
    return {
      item: i + 1,
      codigo: it.codigo,
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      unidad: 'Kilogramo',
      valorUnitario,
      ivaPct,
      ivaValor: round2((total * ivaPct) / 100),
      total,
    };
  });
  if (sinPrecio.size) avisos.push(`Sin precio para: ${[...sinPrecio].join(', ')}.`);

  const subtotal = round2(lineas.reduce((a, l) => a + l.total, 0));
  const iva = round2(lineas.reduce((a, l) => a + l.ivaValor, 0));
  const flete = exportacion && liquidacion && isNum(liquidacion.totales.flete) ? liquidacion.totales.flete : 0;
  const seguro = exportacion && liquidacion ? round2(liquidacion.lines.reduce((a, l) => a + (isNum(l.valueSure) ? l.valueSure : 0), 0)) : 0;
  const conceptoOtros = !!liquidacion && ['DAP', 'DDP'].includes(liquidacion.incoterm ?? '');
  const otrosGastos = exportacion && conceptoOtros && isNum(liquidacion?.totales.otrosGastos) ? liquidacion.totales.otrosGastos : 0;
  const retefuente = 0;
  if (!exportacion) avisos.push('Retefuente en 0: depende de si el cliente es agente retenedor (dato del maestro de clientes de Oben, pendiente).');
  const neto = exportacion ? round2(subtotal + flete + seguro + otrosGastos) : round2(subtotal + iva - retefuente);

  if (exportacion && liquidacion?.sinConfirmar.length) avisos.push('La liquidación tiene puntos sin confirmar con José (ver pantalla de Liquidación).');
  const ncm = texto(liquidacion?.header.paNcm);
  const naladi = texto(liquidacion?.header.paNaladi);
  if (liquidacion?.headerOrigen.paNcm === 'provisional') avisos.push(`Partida arancelaria PROVISIONAL (${ncm}) mientras Oben envía la tabla por producto.`);
  const embarque = texto(liquidacion?.header.puertoEmbarque);
  const arribo = texto(liquidacion?.header.puertoArribo);
  const incoterm = exportacion ? (liquidacion?.incoterm ?? null) : null;

  const observaciones: string[] = [];
  if (exportacion) {
    const desc = descripcionPartida(ncm, lineas.map((l) => l.codigo));
    const e = draft.empaque;
    observaciones.push(
      `PF ${draft.proforma ?? ''}  OV  ${draft.numberOrderSales}`,
      `OBSERVACIONES/COMMENTS:${draft.observaciones ? ` ${draft.observaciones}` : ''}`,
      `DIRECCIÓN/ADDRESS: ${draft.direccionEntrega ?? ''}`,
      `PESO NETO / NET WEIGHT: ${e?.pesoNetoKg ?? ''} KG`,
      `PESO BRUTO / GROSS WEIGHT: ${e?.pesoBrutoKg ?? ''} KG`,
      `PALETAS / PALLETS: ${e?.pallets ?? ''}`,
      `BOBINAS / ROLLS: ${e?.bobinas ?? ''}`,
      `PA NCM: ${ncm ?? ''}${desc ? ` ${desc.descripcionEs} // ${ncm} ${desc.descripcionEn}` : ''}`,
      `PA NALADI: ${naladi ?? ''} `,
      `TOTAL FOB: US$ ${enUS(subtotal)}`,
      `TOTAL FLETE / FREIGHT: US$ ${enUS(flete)}`,
      `TOTAL SEGURO / INSURANCE: US$ ${enUS(seguro)} - `,
      ...(otrosGastos ? [`TOTAL OTROS GASTOS / OTHER EXPENSES: US$ ${enUS(otrosGastos)}`] : []),
      `TOTAL VALOR ${[incoterm, arribo].filter(Boolean).join(' ')} -`,
      ` INCOTERM 2020 US$ ${enUS(neto)}`,
      `PUERTO DE ORIGEN / ORIGEM: ${embarque ?? ''}`,
      `PUERTO DE DESTINO / DESTINATION:  ${arribo ?? ''}`,
      'PAIS DE PROCEDENCIA / COUNTRY OF ORIGIN: Colombia **PAIS DE ADQUISICION/COUNTRY OF ACQUISITION: COLOMBIA',
      `FABRICANTE EXPORTADOR / EXPORTING MANUFACTURER: ${EMISOR_OBEN.razonSocial}`,
    );
    if (!trm) avisos.push('Tipo de cambio (TRM) no disponible: no se pudo consultar datos.gov.co.');
    avisos.push('Forma de pago del cliente (p. ej. "20% IN ADVANCE/ 80% AT SIGHT") sin fuente todavía: va en blanco.');
  } else if (draft.observaciones) {
    observaciones.push(draft.observaciones);
  }

  const direccion = texto(cliente?.direccion) ?? draft.direccionEntrega;
  if (!texto(cliente?.nit)) avisos.push('NIT / identificación del cliente sin fuente todavía (maestro de clientes de Oben): va en blanco.');
  const emision = factura?.emitidaEn ? new Date(factura.emitidaEn) : ahora;
  const base: Omit<FacturaDian, 'qr'> = {
    tipo,
    numero: factura?.invoiceNumber ?? null,
    resolucion,
    cliente: {
      nombre: draft.cliente,
      nit: texto(cliente?.nit),
      direccion,
      ciudad: ciudadDeDireccion(direccion),
      departamento: null,
      pais: draft.pais ? draft.pais.toUpperCase() : null,
      telefono: texto(cliente?.telefono),
      correo: texto(cliente?.correo),
    },
    fechaEmision: fechaEmisionTxt(tipo, emision),
    fechaVencimiento: null,
    pedido: String(draft.numberOrderSales),
    ordenCompra: draft.ordenCompra,
    remision: null,
    condicionesVenta: null,
    medioPago: EMISOR_OBEN.medioPago,
    formaPago: EMISOR_OBEN.formaPago,
    moneda,
    lineas,
    observaciones,
    tipoCambio: exportacion ? (trm?.valor ?? null) : null,
    subtotal,
    ivaPct,
    iva,
    retefuente,
    flete,
    seguro,
    otrosGastos,
    neto,
    valorLetras: valorEnLetras(neto, moneda),
    valorLetrasIngles: exportacion ? null : valueInWords(neto, moneda),
    incoterm,
    terminosPago: null,
    cufe: factura?.cufe ?? null,
    cufeSimulado: !!factura?.simulated,
    marcaAgua: !factura ? 'BORRADOR' : factura.simulated || draft.simulated ? 'SIMULADO' : null,
  };
  return { factura: { ...base, qr: contenidoQr(base, emision, exportacion ? (trm?.valor ?? null) : null) }, avisos };
}
