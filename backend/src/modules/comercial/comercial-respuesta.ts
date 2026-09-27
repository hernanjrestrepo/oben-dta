/**
 * Respuesta del cliente a la Proforma (reunión 2026-09-23, José 34:08): puede
 * aprobarla (firma o confirmación por correo en el mismo hilo), rechazarla
 * ("no va más") o pedir modificar cantidades. Lo que no se entienda con
 * claridad NO se interpreta: queda para una persona.
 */
export type TipoRespuesta = 'aprueba' | 'rechaza' | 'modifica' | 'desconocida';

const RECHAZA = /\b(rechaz\w*|cancel\w*|anul\w*|desist\w*|no\s+(?:continuamos|seguimos|va\s+m[aá]s|procede\w*|aprob\w*|acept\w*|estamos\s+de\s+acuerdo|nos\s+sirve)|ya\s+no\s+(?:va|necesitamos|requerimos))/i;
const MODIFICA = /\b(modific\w*|cambi(?:ar|o|en)\s+(?:la\s+|las\s+)?cantidad\w*|aument\w*|disminu\w*|reduc\w*|quit\w*|agreg\w*|adicion\w*|ajust\w*|en\s+lugar\s+de|en\s+vez\s+de)/i;
const APRUEBA = /\b(aprob\w*|acept\w*|confirm\w*|de\s+acuerdo|firmad\w*|autoriz\w*|procedan|proceder|adelante|approved?|confirmed?|accepted?|ok\b)/i;

export function clasificarRespuesta(texto: string, adjuntos: Array<{ filename: string; contentType?: string | null }>): {
  tipo: TipoRespuesta;
  motivo: string;
} {
  // Solo la respuesta nueva: se corta lo citado del correo anterior.
  const nuevo = cortarCitado(texto);
  const pdf = adjuntos.some((a) => /\.pdf$/i.test(a.filename) || (a.contentType ?? '').includes('pdf'));
  // Una pregunta ("¿pueden confirmar la fecha?", "¿se puede cancelar?") no es
  // una decisión: la revisa una persona.
  if (nuevo.includes('?')) {
    return { tipo: 'desconocida', motivo: `El cliente hace una pregunta: "${nuevo.replace(/\s+/g, ' ').slice(0, 120)}" — revísalo.` };
  }
  if (RECHAZA.test(nuevo)) return { tipo: 'rechaza', motivo: `El cliente escribió: "${extracto(nuevo, RECHAZA)}"` };
  if (MODIFICA.test(nuevo)) return { tipo: 'modifica', motivo: `El cliente pide un cambio: "${extracto(nuevo, MODIFICA)}"` };
  if (APRUEBA.test(nuevo)) return { tipo: 'aprueba', motivo: `El cliente escribió: "${extracto(nuevo, APRUEBA)}"${pdf ? ' (adjunta PDF)' : ''}` };
  if (pdf && nuevo.trim().length < 40) return { tipo: 'aprueba', motivo: 'El cliente devolvió un PDF (probablemente la Proforma firmada) sin texto.' };
  return { tipo: 'desconocida', motivo: 'No se pudo determinar si el cliente aprueba, rechaza o pide modificar — revísalo.' };
}

/** Quita el texto citado ("> ...", "El ... escribió:", "On ... wrote:", "De: ...") de una respuesta. */
export function cortarCitado(texto: string): string {
  const lineas = texto.split(/\r?\n/);
  const out: string[] = [];
  for (const l of lineas) {
    if (/^\s*>/.test(l)) break;
    if (/^\s*(el\s.+escribi[oó]:|on\s.+wrote:|de:\s|from:\s|-{2,}\s*(mensaje original|original message))/i.test(l)) break;
    out.push(l);
  }
  return out.join('\n').trim();
}

function extracto(texto: string, re: RegExp): string {
  const m = texto.match(re);
  if (!m || m.index === undefined) return texto.slice(0, 80);
  const start = Math.max(0, m.index - 30);
  return texto.slice(start, m.index + m[0].length + 40).replace(/\s+/g, ' ').trim();
}
