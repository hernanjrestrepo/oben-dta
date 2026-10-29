/**
 * La proforma como la imprime OBEN MAS (María Escobar, 28-oct: "que salga tal cual como la muestra Oben MAS o que
 * permita descargar"). Se arma SOLO con datos que ya tenemos de Oben, sin inventar nada:
 *  - cantidades por SKU: reporte de proformas COMEX (sigue respondiendo después de liquidada; el ítem 1 de la 11562
 *    da 2.932,13 kg, igual que el documento de OBEN MAS);
 *  - precio y partida: spCheckSettlement (vivo mientras está pendiente) o la copia que el sistema guardó;
 *  - rollos y contenedor: Lista de Empaque de la OV; ancho, diámetro y core: el SKU y el maestro de productos.
 * Lo que ninguna fuente entrega queda en `faltantes` y se muestra como "no disponible".
 */
export interface EmpaqueSku {
  sku: string;
  rollos: number;
  kilosNetos: number;
}

export interface EmpaqueOv {
  ov: number;
  cliente?: string | null;
  ordenCompra?: string | null;
  contenedor?: string | null;
  pais?: string | null;
  pallets?: number | null;
  skus: EmpaqueSku[];
}

export interface EntradaProformaDocumento {
  numberPF: string;
  /** spCheckSettlement vivo o la copia guardada. */
  check: { campos: Record<string, unknown>; detalle: Array<Record<string, unknown>> } | null;
  /** Fecha de la copia (null = datos en vivo). */
  copiaDe: string | null;
  /** Fila de la proforma en el reporte COMEX. */
  reporte: Record<string, unknown> | null;
  empaque: EmpaqueOv[];
  /** Dirección del cliente en el maestro de Oben, si no vino en la liquidación. */
  direccionCliente: string | null;
  /** Core, línea y diámetro por referencia, del maestro de productos (opcional). */
  maestroProductos?: Record<string, { linea?: string; core?: string; diametro?: string; ancho?: number }>;
}

export interface LineaProformaDocumento {
  item: number;
  sku: string;
  ov: string | null;
  kilos: number;
  rollos: number | null;
  descripcion: string;
  diametroMm: number | null;
  core: string | null;
  partida: string | null;
  precio: number | null;
  total: number | null;
}

export interface ProformaDocumento {
  numberPF: string;
  ordenCompra: string | null;
  ordenesVenta: string[];
  mercado: string | null;
  pais: string | null;
  vendidoA: { nombre: string | null; direccion: string | null };
  entregadoEn: { nombre: string | null; direccion: string | null };
  consignadoA: string | null;
  embarcador: string;
  origen: string;
  desde: string | null;
  hasta: string | null;
  puertoDestino: string | null;
  contenedores: string | null;
  formaPago: string | null;
  embalaje: string | null;
  incoterm: string | null;
  fechas: { proforma: string | null; estimadaEmbarque: string | null; estimadaEntrega: string | null; requeridaCliente: string | null };
  lineas: LineaProformaDocumento[];
  totalKilos: number;
  totalUsd: number | null;
  /** 'vivo' = spCheckSettlement hoy; 'copia' = guardada antes de liquidarse; 'sin_liquidacion' = solo reporte y Lista de Empaque. */
  fuenteLiquidacion: 'vivo' | 'copia' | 'sin_liquidacion';
  copiaDe: string | null;
  faltantes: string[];
}

/** Datos fijos de la empresa que aparecen en el documento (encabezado del formato de OBEN MAS). */
export const OBEN_COLOMBIA = {
  razonSocial: 'OBEN COLOMBIA S.A.S.',
  direccion: 'ZONA FRANCA ZOFIA KM114 MZ 20 LT318 - GALAPA - ATLANTICO - COLOMBIA',
  origen: 'GALAPA - ATLANTICO - COLOMBIA',
};

/** Nombre comercial por familia de película (lo que se ve en "Descripción del Producto"). */
const NOMBRE_FAMILIA: Record<string, string> = { ET: 'OPET PLAIN FILM' };

export interface SkuDecodificado {
  familia: string;
  micras: number;
  tipo: string;
  anchoMm: number;
  coreLetra: string;
  diametroMm: number;
}

/** 'ET---0010QN0750S0760' → familia ET, 10 micras, tipo QN, ancho 750 mm, core S, diámetro 760 mm. null si no calza el formato. */
export function decodificarSku(sku: string): SkuDecodificado | null {
  const m = /^([A-Za-z]{1,4})-*(\d{4})([A-Za-z]{2})(\d{4})([A-Za-z])(\d{4})$/.exec(String(sku).trim());
  if (!m) return null;
  return { familia: m[1].toUpperCase(), micras: Number(m[2]), tipo: m[3].toUpperCase(), anchoMm: Number(m[4]), coreLetra: m[5].toUpperCase(), diametroMm: Number(m[6]) };
}

/** Core S (estándar) = 6 pulgadas, como en "Core 6 Diámetro 760" del documento de OBEN MAS. Otras letras: sin dato. */
const CORE_POR_LETRA: Record<string, string> = { S: '6' };

const t = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};
const n = (v: unknown): number | null => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const r2 = (x: number) => Math.round(x * 100) / 100;

export function descripcionLinea(sku: string, maestro?: { linea?: string; core?: string; diametro?: string; ancho?: number }): { descripcion: string; diametroMm: number | null; core: string | null } {
  const d = decodificarSku(sku);
  if (!d) return { descripcion: sku, diametroMm: null, core: null };
  const core = CORE_POR_LETRA[d.coreLetra] ?? t(maestro?.core) ?? null;
  const nombre = NOMBRE_FAMILIA[d.familia] ?? 'PELÍCULA';
  const descripcion = `${nombre} ${d.familia}${d.micras} ${d.tipo} X ${d.anchoMm} MM${core ? ` Core ${core}` : ''} Diámetro ${d.diametroMm}`;
  return { descripcion, diametroMm: d.diametroMm, core };
}

export function armarProformaDocumento(e: EntradaProformaDocumento): ProformaDocumento {
  const campos = e.check?.campos ?? {};
  const rep = e.reporte ?? {};
  const faltantes: string[] = [];

  // Cantidades por SKU: del reporte COMEX (todas las OV de la proforma, SKU repetido = suma).
  const porSku = new Map<string, { kilos: number; ov: string | null }>();
  for (const ovFila of Array.isArray(rep.OrdenesVenta) ? (rep.OrdenesVenta as Array<Record<string, unknown>>) : []) {
    for (const d of Array.isArray(ovFila.DetalleSKU) ? (ovFila.DetalleSKU as Array<Record<string, unknown>>) : []) {
      const sku = t(d.SKU);
      const kg = n(d.Cantidad);
      if (!sku || kg === null) continue;
      const previo = porSku.get(sku);
      porSku.set(sku, { kilos: r2((previo?.kilos ?? 0) + kg), ov: previo?.ov ?? t(ovFila.NroOrdenVenta) });
    }
  }
  // Sin reporte: se arma con la Lista de Empaque (kilos netos empacados).
  if (porSku.size === 0) {
    for (const o of e.empaque) for (const s of o.skus) porSku.set(s.sku, { kilos: r2((porSku.get(s.sku)?.kilos ?? 0) + s.kilosNetos), ov: String(o.ov) });
    if (porSku.size > 0) faltantes.push('Cantidades pedidas por SKU (se muestran los kilos empacados de la Lista de Empaque)');
  }

  const rollosPorSku = new Map<string, number>();
  for (const o of e.empaque) for (const s of o.skus) rollosPorSku.set(s.sku, (rollosPorSku.get(s.sku) ?? 0) + s.rollos);

  const detalleCheck = e.check?.detalle ?? [];
  const lineas: LineaProformaDocumento[] = [...porSku.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([sku, v], i) => {
      const pelicula = sku.slice(0, 11);
      const fila = detalleCheck.find((l) => String(l.TipoPelicula ?? '').trim() === pelicula);
      const precio = n(fila?.Precio);
      const base = descripcionLinea(sku, e.maestroProductos?.[sku]);
      return {
        item: i + 1,
        sku,
        ov: v.ov,
        kilos: v.kilos,
        rollos: rollosPorSku.has(sku) ? rollosPorSku.get(sku)! : null,
        descripcion: base.descripcion,
        diametroMm: base.diametroMm,
        core: base.core,
        partida: t(fila?.Partida ?? fila?.Parida),
        precio,
        total: precio === null ? null : r2(v.kilos * precio),
      };
    });

  const totalKilos = r2(lineas.reduce((a, l) => a + l.kilos, 0));
  const conPrecio = lineas.length > 0 && lineas.every((l) => l.total !== null);
  const fuenteLiquidacion = !e.check ? 'sin_liquidacion' : e.copiaDe ? 'copia' : 'vivo';
  if (!e.check) faltantes.push('Precio unitario, total y partida de cada línea (Oben solo entrega la liquidación mientras la proforma está pendiente y esta ya no tiene copia guardada)');
  else if (!conPrecio) faltantes.push('Precio de algunas líneas (no coinciden con la liquidación)');
  if (lineas.some((l) => l.rollos === null)) faltantes.push('Rollos de algunas líneas (aún no están en la Lista de Empaque)');

  const empaque0 = e.empaque[0];
  const cliente = t(campos.Cliente) ?? t(rep.Cliente) ?? t(empaque0?.cliente);
  const direccion = t(campos.Direccion) ?? e.direccionCliente;
  if (!direccion) faltantes.push('Dirección del cliente');
  const hasta = t(campos.PuertoArribo);
  const contenedores = e.empaque.length ? [...new Set(e.empaque.map((o) => t(o.contenedor)).filter((x): x is string => !!x))].join(' · ') || null : null;
  const pallets = e.empaque.reduce((a, o) => a + (o.pallets ?? 0), 0);

  // Datos que viven solo en el encabezado de OBEN MAS y ningún reporte que leemos trae.
  faltantes.push('Consignado a', 'Fecha de la proforma', 'Fechas estimadas de embarque y entrega y fecha requerida por el cliente');
  if (!contenedores) faltantes.push('Contenedores');
  if (!t(campos.PuertoEmbarque)) faltantes.push('Puerto de embarque (Desde)');
  if (!hasta) faltantes.push('Puerto de arribo (Hasta)');
  if (!t(campos.TerminoPago)) faltantes.push('Forma de pago');

  return {
    numberPF: e.numberPF,
    ordenCompra: t(campos.OrdenCompra) ?? t(empaque0?.ordenCompra),
    ordenesVenta: [...new Set([...(Array.isArray(rep.OrdenesVenta) ? (rep.OrdenesVenta as Array<Record<string, unknown>>).map((o) => t(o.NroOrdenVenta)) : []), ...e.empaque.map((o) => String(o.ov))].filter((x): x is string => !!x))],
    mercado: t(rep.Mercado),
    pais: t(campos.Pais) ?? t(rep.Pais) ?? t(empaque0?.pais),
    vendidoA: { nombre: cliente, direccion },
    entregadoEn: { nombre: cliente, direccion },
    consignadoA: null,
    embarcador: OBEN_COLOMBIA.razonSocial,
    origen: OBEN_COLOMBIA.origen,
    desde: t(campos.PuertoEmbarque),
    hasta,
    puertoDestino: hasta ? hasta.replace(/^PUERTO\s+/i, '') : null,
    contenedores,
    formaPago: t(campos.TerminoPago),
    embalaje: pallets > 0 ? 'IN PALLETS' : null,
    incoterm: t(campos.Incoterms) ?? t(campos.Incoterm) ?? t(rep.Incoterms),
    fechas: { proforma: null, estimadaEmbarque: null, estimadaEntrega: null, requeridaCliente: null },
    lineas,
    totalKilos,
    totalUsd: conPrecio ? r2(lineas.reduce((a, l) => a + (l.total ?? 0), 0)) : null,
    fuenteLiquidacion,
    copiaDe: e.copiaDe,
    faltantes,
  };
}
