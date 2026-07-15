import { Quote } from '../../entities/quote.entity';

/** Envoltura corporativa Oben reutilizable para correos automáticos. */
function obenShell(bodyInner: string): string {
  return `<!doctype html>
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
            <tr><td style="padding:32px;">${bodyInner}</td></tr>
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
}

/**
 * Respuesta automática cuando el remitente NO pertenece a un cliente
 * registrado y activo. No se cotiza; se indica cómo registrarse.
 */
export function renderUnknownClientEmail(from: string): {
  subject: string;
  html: string;
} {
  const subject = 'Solicitud recibida — Registro requerido · Oben Group';
  const html = obenShell(`
    <p style="margin:0 0 8px;color:#111827;font-size:16px;">Estimado solicitante,</p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
      Hemos recibido su solicitud enviada desde <b>${from}</b>. Sin embargo, su
      correo no corresponde a un cliente registrado y activo en nuestro sistema,
      por lo que no es posible generar una cotización en este momento.
    </p>
    <p style="margin:0 0 8px;color:#111827;font-size:14px;font-weight:600;">Para continuar, por favor complete su registro como cliente enviando:</p>
    <ul style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      <li>Razón social y NIT / identificación tributaria</li>
      <li>Dirección y datos de contacto comercial</li>
      <li>Correo corporativo de facturación</li>
    </ul>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">
      Un asesor comercial de Oben Group se pondrá en contacto para completar su
      registro. Su solicitud ha quedado registrada para seguimiento.
    </p>`);
  return { subject, html };
}

/**
 * Respuesta automática cuando la solicitud no contiene información suficiente
 * (productos/cantidades) para cotizar. Solicita exactamente lo que falta.
 */
export function renderInsufficientInfoEmail(clientName: string): {
  subject: string;
  html: string;
} {
  const subject = 'Necesitamos más información para su cotización · Oben Group';
  const html = obenShell(`
    <p style="margin:0 0 8px;color:#111827;font-size:16px;">Estimado(a) ${clientName},</p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
      Gracias por su solicitud. Para poder generar su cotización necesitamos que
      nos confirme la siguiente información:
    </p>
    <ul style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
      <li>Producto(s) específico(s) de nuestro portafolio</li>
      <li>Cantidad requerida por producto (con unidad: kg, toneladas, rollos)</li>
      <li>Cualquier especificación técnica relevante (calibre, ancho, acabado)</li>
    </ul>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">
      Al responder este correo con los datos faltantes, continuaremos
      automáticamente con la generación de su cotización.
    </p>`);
  return { subject, html };
}

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
