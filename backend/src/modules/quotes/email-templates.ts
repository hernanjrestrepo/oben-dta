import { Quote } from '../../entities/quote.entity';

/**
 * Plantilla HTML de correo con la identidad corporativa de Oben (navy #003366,
 * mismo lenguaje visual que el PDF de cotización y la interfaz web). La usa
 * el paso "enviar respuesta" del pipeline de cotizaciones.
 */
export function renderQuoteResponseEmail(quote: Quote): {
  subject: string;
  html: string;
} {
  const subject = `Cotización ${quote.quoteNumber} — Oben Group`;
  const rows = (quote.items || [])
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;">${item.product?.name ?? 'Producto'}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;color:#6B7280;font-family:monospace;font-size:12px;">${item.product?.sku ?? ''}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;text-align:right;">${item.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;text-align:right;">$${Number(item.unitPrice).toLocaleString('es-CO')}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:600;">$${Number(item.totalPrice).toLocaleString('es-CO')}</td>
      </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#F5F7FA;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" style="background:#F5F7FA;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:#003366;padding:24px 32px;">
                <table role="presentation" width="100%">
                  <tr>
                    <td style="width:40px;">
                      <div style="width:36px;height:36px;background:#ffffff;border-radius:8px;text-align:center;line-height:36px;font-weight:700;color:#003366;font-size:18px;">O</div>
                    </td>
                    <td>
                      <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">OBEN GROUP</p>
                      <p style="margin:0;color:#B8CCE0;font-size:12px;">Digitalización Total Autónoma</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 8px;color:#111827;font-size:16px;">Estimado(a) ${quote.client?.name ?? 'cliente'},</p>
                <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6;">
                  Gracias por su solicitud. Adjuntamos la cotización <b>${quote.quoteNumber}</b> con el detalle
                  de los productos solicitados. El documento PDF con validez de 30 días calendario se encuentra adjunto a este correo.
                </p>
                <table role="presentation" width="100%" style="border-collapse:collapse;margin-bottom:16px;">
                  <thead>
                    <tr style="background:#003366;">
                      <th style="padding:10px 12px;color:#ffffff;font-size:12px;text-align:left;">Producto</th>
                      <th style="padding:10px 12px;color:#ffffff;font-size:12px;text-align:left;">SKU</th>
                      <th style="padding:10px 12px;color:#ffffff;font-size:12px;text-align:right;">Cant.</th>
                      <th style="padding:10px 12px;color:#ffffff;font-size:12px;text-align:right;">Precio Unit.</th>
                      <th style="padding:10px 12px;color:#ffffff;font-size:12px;text-align:right;">Total</th>
                    </tr>
                  </thead>
                  <tbody style="font-size:13px;color:#111827;">
                    ${rows}
                  </tbody>
                </table>
                <table role="presentation" width="100%">
                  <tr>
                    <td align="right" style="color:#374151;font-size:13px;padding:2px 0;">Subtotal: $${Number(quote.subtotal).toLocaleString('es-CO')}</td>
                  </tr>
                  <tr>
                    <td align="right" style="color:#374151;font-size:13px;padding:2px 0;">IVA (19%): $${Number(quote.taxAmount).toLocaleString('es-CO')}</td>
                  </tr>
                  <tr>
                    <td align="right" style="color:#003366;font-size:18px;font-weight:700;padding:8px 0;">Total: $${Number(quote.total).toLocaleString('es-CO')}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:#F5F7FA;padding:20px 32px;border-top:1px solid #E5E7EB;">
                <p style="margin:0;color:#6B7280;font-size:11px;">Oben Group — Exportaciones e Industria · Este es un mensaje automático generado por DTA Oben.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html };
}
