import PDFDocument from 'pdfkit';
import { OBEN_LOGO_BASE64 } from '../oben-reports/oben-logo';
import { OBEN_COLOMBIA, type ProformaDocumento } from './proforma-documento';

/**
 * PDF de la proforma con el formato del documento que imprime OBEN MAS (María Escobar, 28-oct): logo y datos de Oben
 * Colombia, número y fecha, "Pedido Cliente", fechas, "Vendido a", "Entregado en", "Consignado a", embarcador, origen,
 * desde/hasta, contenedores, forma de pago, embalaje, Incoterm 2020 y la tabla de ítems. Los datos que ninguna
 * fuente de Oben entrega salen como "no disponible" (nunca inventados) y se listan al pie.
 */
const M = 28;
const NO = 'no disponible';
const num = (v: number | null, dec = 2) => (v === null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }));

export function proformaPdf(p: ProformaDocumento): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'letter', layout: 'landscape', margin: M });
  const partes: Buffer[] = [];
  doc.on('data', (c: Buffer) => partes.push(c));
  const listo = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });

  const W = doc.page.width - M * 2;
  const borde = '#222222';
  const gris = '#666666';

  const caja = (x: number, y: number, w: number, h: number, etiqueta: string, valor: string | null, opts: { fuente?: number; sinDato?: boolean } = {}) => {
    doc.lineWidth(0.8).strokeColor(borde).rect(x, y, w, h).stroke();
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#111111').text(etiqueta, x + 4, y + 3, { width: w - 8 });
    const sin = valor === null || valor === '';
    doc
      .font(sin ? 'Helvetica-Oblique' : 'Helvetica')
      .fontSize(opts.fuente ?? 8.5)
      .fillColor(sin ? '#B45309' : '#111111')
      .text(sin ? NO : String(valor), x + 4, y + 14, { width: w - 8, height: h - 16, ellipsis: true });
  };

  /** Caja de una sola línea: etiqueta a la izquierda y valor a la derecha (las fechas). */
  const cajaLinea = (x: number, y: number, w: number, h: number, etiqueta: string, valor: string | null) => {
    doc.lineWidth(0.8).strokeColor(borde).rect(x, y, w, h).stroke();
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#111111').text(etiqueta, x + 4, y + (h - 7) / 2, { width: w * 0.62, lineBreak: false });
    const sin = !valor;
    doc.font(sin ? 'Helvetica-Oblique' : 'Helvetica-Bold').fontSize(sin ? 7.5 : 9).fillColor(sin ? '#B45309' : '#111111').text(sin ? NO : valor!, x + w * 0.62, y + (h - 8) / 2, { width: w * 0.38 - 4, align: 'right', lineBreak: false });
  };

  // Encabezado: logo, datos de Oben Colombia, número de proforma
  try {
    doc.image(Buffer.from(OBEN_LOGO_BASE64, 'base64'), M, M, { fit: [90, 40] });
  } catch {
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#F47735').text('oben', M, M + 6);
  }
  doc.font('Helvetica').fontSize(7.5).fillColor('#111111').text(OBEN_COLOMBIA.direccion, M + 100, M + 2, { width: 250 });
  doc.font('Helvetica-Bold').fontSize(10).text(OBEN_COLOMBIA.razonSocial, M + 100, M + 26, { width: 250 });
  doc.font('Helvetica').fontSize(9).fillColor('#111111').text('Proforma:', W - 190, M + 4, { continued: true });
  doc.font('Helvetica-Bold').fontSize(24).fillColor('#111111').text(` ${p.numberPF}`);
  doc.font('Helvetica').fontSize(8).fillColor(gris).text(`Fecha (Date): ${p.fechas.proforma ?? NO}`, W - 190, M + 34);

  let y = M + 52;
  const h1 = 54;
  const izq = W * 0.58;
  caja(M, y, izq, h1, 'Pedido Cliente Nro:  (Customer Order)', p.ordenCompra, { fuente: 11 });
  const fw = W - izq;
  cajaLinea(M + izq, y, fw, h1 / 3, 'Fecha Estimada Embarque (Estimated Date of Shipment)', p.fechas.estimadaEmbarque);
  cajaLinea(M + izq, y + h1 / 3, fw, h1 / 3, 'Fecha Estimada Entrega (Estimated Date of Delivery)', p.fechas.estimadaEntrega);
  cajaLinea(M + izq, y + (h1 * 2) / 3, fw, h1 / 3, 'Fecha Requerida Cliente (Customer Required Date)', p.fechas.requeridaCliente);
  y += h1;

  const dir = (b: { nombre: string | null; direccion: string | null }) => [b.nombre, b.direccion].filter(Boolean).join('\n') || null;
  const h2 = 52;
  caja(M, y, izq, h2, 'Vendido a:  (Sold To)', dir(p.vendidoA), { fuente: 7.5 });
  caja(M + izq, y, fw, h2, 'Puerto Destino  (Destination Port)', p.puertoDestino);
  y += h2;
  caja(M, y, izq, h2, 'Entregado en:  (Shipped To)', dir(p.entregadoEn), { fuente: 7.5 });
  caja(M + izq, y, fw, h2, 'Mercado / País', [p.mercado, p.pais].filter(Boolean).join(' — ') || null);
  y += h2;
  caja(M, y, W, 30, 'Consignado a:  (consigned to)', p.consignadoA, { fuente: 7.5 });
  y += 30;
  caja(M, y, izq, 26, 'Embarcador Por:  (Shipped by)', p.embarcador);
  caja(M + izq, y, fw, 26, 'Origen:  (Origin)', p.origen);
  y += 26;
  caja(M, y, izq, 26, 'Desde:  (From)', p.desde);
  caja(M + izq, y, fw, 26, 'Hasta:  (To)', p.hasta);
  y += 26;
  caja(M, y, izq, 26, 'Contenedores:  (Nº Containers)', p.contenedores, { fuente: 7.5 });
  caja(M + izq, y, fw, 26, 'Forma de Pago:  (Payment Terms)', p.formaPago);
  y += 26;
  caja(M, y, izq, 26, 'Embalaje:  (Package)', p.embalaje);
  caja(M + izq, y, fw, 26, 'Incoterm 2020', p.incoterm);
  y += 32;

  // Tabla de ítems
  const cols: Array<{ t: string; w: number; a?: 'right' | 'center' }> = [
    { t: 'Item', w: 28, a: 'center' },
    { t: 'Cant. (Quantity)\nKg', w: 78, a: 'right' },
    { t: 'Rollos\n(Rolls)', w: 44, a: 'center' },
    { t: 'Descripción del Producto\n(Product Description)', w: W - 28 - 78 - 44 - 60 - 36 - 70 - 70 - 82, },
    { t: 'Diámetro\n(mm)', w: 60, a: 'center' },
    { t: 'Core\n(plg)', w: 36, a: 'center' },
    { t: 'P.A.', w: 70, a: 'center' },
    { t: 'Precio Unit.\n(Unit Price)', w: 70, a: 'right' },
    { t: 'Total\nUS$', w: 82, a: 'right' },
  ];
  const fila = (valores: string[], alto: number, cab: boolean) => {
    let x = M;
    cols.forEach((c, i) => {
      doc.lineWidth(0.6).strokeColor(borde).rect(x, y, c.w, alto).stroke();
      doc.font(cab ? 'Helvetica-Bold' : 'Helvetica').fontSize(cab ? 7 : 8).fillColor('#111111').text(valores[i], x + 3, y + (cab ? 3 : 4), { width: c.w - 6, align: cab ? 'center' : (c.a ?? 'left'), height: alto - 4, ellipsis: true });
      x += c.w;
    });
    y += alto;
  };
  fila(cols.map((c) => c.t), 24, true);
  for (const l of p.lineas) {
    if (y > doc.page.height - M - 90) {
      doc.addPage();
      y = M;
      fila(cols.map((c) => c.t), 24, true);
    }
    fila([String(l.item), num(l.kilos), l.rollos === null ? '—' : String(l.rollos), l.descripcion, l.diametroMm === null ? '—' : String(l.diametroMm), l.core ?? '—', l.partida ?? '—', l.precio === null ? '—' : num(l.precio, 4), num(l.total)], 24, false);
  }
  // Totales
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111');
  doc.text(`Total kilos: ${num(p.totalKilos)}`, M, y + 6, { width: W / 2 });
  doc.text(`Total US$: ${p.totalUsd === null ? NO : num(p.totalUsd)}`, M + W / 2, y + 6, { width: W / 2, align: 'right' });
  y += 24;

  // Procedencia y datos no disponibles
  doc.font('Helvetica').fontSize(7).fillColor(gris);
  const fuente =
    p.fuenteLiquidacion === 'vivo'
      ? 'Precios y partida: liquidación de Oben en vivo.'
      : p.fuenteLiquidacion === 'copia'
        ? `Precios y partida: copia de la liquidación de Oben guardada el ${p.copiaDe ? new Date(p.copiaDe).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : '—'}.`
        : 'Sin liquidación de Oben disponible para esta proforma.';
  doc.text(`Datos de OBEN MAS leídos por Oben Xmart. Cantidades: reporte de proformas COMEX. ${fuente} Rollos y contenedor: Lista de Empaque. Documento informativo: no reemplaza el PDF oficial de OBEN MAS.`, M, y, { width: W });
  if (p.faltantes.length) {
    doc.font('Helvetica-Oblique').fillColor('#B45309').text(`No disponible en las fuentes de Oben: ${p.faltantes.join('; ')}.`, M, doc.y + 3, { width: W });
  }
  doc.end();
  return listo;
}
