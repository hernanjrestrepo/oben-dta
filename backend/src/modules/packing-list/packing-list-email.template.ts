/**
 * Escapa HTML antes de interpolar cualquier valor no confiable — misma regla
 * que quotes/email-templates.ts. Aquí el dato viene del ERP real de Oben, no
 * de un usuario, pero sigue siendo una fuente externa: no vale la pena
 * decidir caso por caso qué campo es "seguro", se escapa siempre.
 */
function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return ch;
    }
  });
}

function obenShell(bodyInner: string): string {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#F5F7FA;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" style="background:#F5F7FA;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="700" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:#F47735;padding:24px 32px;">
                <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">OBEN XMART</p>
                <p style="margin:0;color:#FFE3D1;font-size:12px;">Lista de Empaque — datos en vivo del ERP de Oben</p>
              </td>
            </tr>
            <tr><td style="padding:32px;">${bodyInner}</td></tr>
            <tr>
              <td style="background:#F5F7FA;padding:20px 32px;border-top:1px solid #E5E7EB;">
                <p style="margin:0;color:#6B7280;font-size:11px;">Oben Xmart by Paradixe · Este es un mensaje automático, la información se consultó en vivo al sistema de Oben.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

interface PackingListLine {
  [key: string]: unknown;
}

export function renderPackingListEmail(
  numberOrderSales: number,
  data: Record<string, unknown>,
): { subject: string; html: string } {
  const lines = (data.DetailedPackingList as PackingListLine[] | undefined) ?? [];
  const cliente = escapeHtml(data.Cliente ?? '—');
  const documento = escapeHtml(data.Documento ?? '—');
  const numero = escapeHtml(data.Numero ?? '—');
  const fecha = escapeHtml(data.Fecha ?? '—');
  const almacen = escapeHtml(data.Almacen ?? '—');

  const columns = ['Descripcion', 'Lote', 'BobinaPesoNetoKg', 'PaletaPesoNetoKg', 'PaletaPesoBrutoKg'];
  const columnLabels: Record<string, string> = {
    Descripcion: 'Producto',
    Lote: 'Lote',
    BobinaPesoNetoKg: 'Peso Neto (kg)',
    PaletaPesoNetoKg: 'Peso Neto Paleta (kg)',
    PaletaPesoBrutoKg: 'Peso Bruto Paleta (kg)',
  };

  const headerRow = columns
    .map((c) => `<th style="text-align:left;padding:8px 10px;background:#FFF1E8;color:#B34E14;font-size:11px;">${escapeHtml(columnLabels[c])}</th>`)
    .join('');

  const bodyRows = lines
    .map((line, i) => {
      const bg = i % 2 === 0 ? '#FAFAFA' : '#FFFFFF';
      const cells = columns
        .map((c) => `<td style="padding:6px 10px;color:#333333;font-size:11px;border-top:1px solid #F0F0F0;">${escapeHtml(line[c] ?? '—')}</td>`)
        .join('');
      return `<tr style="background:${bg};">${cells}</tr>`;
    })
    .join('');

  const inner = `
    <p style="margin:0 0 16px;color:#333333;font-size:14px;">Lista de empaque de la orden <strong>${numberOrderSales}</strong>, consultada en vivo al sistema real de Oben.</p>
    <table role="presentation" width="100%" style="margin-bottom:20px;">
      <tr>
        <td style="padding:4px 0;color:#6B7280;font-size:11px;">CLIENTE</td>
        <td style="padding:4px 0;color:#6B7280;font-size:11px;">DOCUMENTO</td>
        <td style="padding:4px 0;color:#6B7280;font-size:11px;">NÚMERO</td>
        <td style="padding:4px 0;color:#6B7280;font-size:11px;">FECHA</td>
        <td style="padding:4px 0;color:#6B7280;font-size:11px;">ALMACÉN</td>
      </tr>
      <tr>
        <td style="padding:2px 0;color:#111827;font-size:12px;font-weight:600;">${cliente}</td>
        <td style="padding:2px 0;color:#111827;font-size:12px;font-weight:600;">${documento}</td>
        <td style="padding:2px 0;color:#111827;font-size:12px;font-weight:600;">${numero}</td>
        <td style="padding:2px 0;color:#111827;font-size:12px;font-weight:600;">${fecha}</td>
        <td style="padding:2px 0;color:#111827;font-size:12px;font-weight:600;">${almacen}</td>
      </tr>
    </table>
    <table role="presentation" width="100%" style="border-collapse:collapse;">
      <thead><tr>${headerRow}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <p style="margin:16px 0 0;color:#9CA3AF;font-size:10px;">${lines.length} línea${lines.length !== 1 ? 's' : ''} en total.</p>
  `;

  return {
    subject: `Lista de Empaque — Orden ${numberOrderSales} (${documento} ${numero})`,
    html: obenShell(inner),
  };
}
