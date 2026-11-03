/**
 * Utilidades de lectura de correos (3-nov, caso de Alejandra Molinares: un reenvío de Outlook en HTML llegó al lector
 * de órdenes como HTML crudo —con la firma y sus imágenes en base64— y de ahí salieron una "orden" y dos "líneas" basura).
 */

const ENTIDADES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&aacute;': 'á', '&eacute;': 'é', '&iacute;': 'í', '&oacute;': 'ó', '&uacute;': 'ú', '&ntilde;': 'ñ', '&Aacute;': 'Á', '&Eacute;': 'É', '&Iacute;': 'Í', '&Oacute;': 'Ó', '&Uacute;': 'Ú', '&Ntilde;': 'Ñ' };

/** ¿El texto es en realidad HTML? (cuerpo de un correo que solo trae parte HTML). */
export function pareceHtml(t: string): boolean {
  return /<\s*(html|body|table|div|p|br|span|style)\b[^>]*>/i.test(t.slice(0, 5000));
}

/** HTML → texto plano legible: sin estilos, scripts, imágenes en base64 ni etiquetas; saltos de línea donde los hay. */
export function htmlATexto(html: string): string {
  let t = String(html ?? '');
  t = t.replace(/<!--[\s\S]*?-->/g, ' ');
  t = t.replace(/<(style|script|head|title)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  t = t.replace(/<img\b[^>]*>/gi, ' ');
  t = t.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]{40,}/gi, ' ');
  t = t.replace(/<\s*br\s*\/?>/gi, '\n');
  t = t.replace(/<\/\s*(p|div|tr|li|h[1-6]|table|blockquote)\s*>/gi, '\n');
  t = t.replace(/<\/\s*t[dh]\s*>/gi, ' ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)));
  t = t.replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCharCode(parseInt(n, 16)));
  t = t.replace(/&[a-zA-Z]+;/g, (e) => ENTIDADES[e] ?? ' ');
  return t
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Cuerpo de un correo listo para leer: el texto plano si lo hay y es texto; si no, el HTML convertido. */
export function cuerpoLegible(texto: string | undefined | null, html: string | false | undefined | null): string {
  const t = (texto ?? '').trim();
  if (t && !pareceHtml(t)) return texto as string;
  const h = typeof html === 'string' && html.trim() ? html : t;
  return htmlATexto(h);
}

/**
 * Remitente ORIGINAL de un correo reenviado ("RV:" / "FW:"): la dirección de la primera línea "De:" / "From:" del
 * bloque reenviado que no sea de ninguno de los dominios dados (los internos de Oben). null si no hay.
 */
export function remitenteReenviado(cuerpo: string, dominiosInternos: string[]): string | null {
  const internos = dominiosInternos.map((d) => d.toLowerCase());
  for (const linea of cuerpo.split('\n')) {
    const m = /^\s*(?:de|from|von|da)\s*:\s*(.+)$/i.exec(linea);
    if (!m) continue;
    const correo = /[A-Za-z0-9._%+'-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/.exec(m[1]);
    if (!correo) continue;
    const dominio = correo[1].toLowerCase();
    if (internos.some((d) => dominio === d || dominio.endsWith(`.${d}`))) continue;
    return correo[0].toLowerCase();
  }
  return null;
}

/** ¿El asunto es el de un reenvío? */
export const esReenvio = (asunto: string): boolean => /^\s*(?:(?:RE|RV)\s*:\s*)*(?:RV|FW|FWD)\s*:/i.test(asunto);
