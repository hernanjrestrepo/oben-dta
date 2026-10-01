/**
 * José (respuesta a la pregunta 9, 2026-09-30): Dirección, Puerto de arribo y
 * Puerto de embarque vienen POR DEFECTO de spCheckSettlement_Paradixe, y el
 * usuario los puede modificar. En la verificación en vivo del 2026-09-23 esos
 * campos aún no venían y no conocemos su nombre exacto, así que se buscan con
 * tolerancia (sin distinguir mayúsculas, `_` ni espacios). Si no están, no se
 * inventan: quedan como faltantes para que el usuario los digite.
 */
export interface DefaultsDeOben {
  direccion?: string;
  puertoArribo?: string;
  puertoEmbarque?: string;
}

const PATRONES: Array<[keyof DefaultsDeOben, RegExp]> = [
  ['direccion', /^direcci[oó]n/i],
  ['puertoArribo', /^puerto(de)?(arribo|destino|llegada)/i],
  ['puertoEmbarque', /^puerto(de)?(embarque|origen|salida)/i],
];

export function defaultsDeOben(respuesta: Record<string, unknown> | null | undefined): DefaultsDeOben {
  const out: DefaultsDeOben = {};
  if (!respuesta || typeof respuesta !== 'object') return out;
  for (const [campo, patron] of PATRONES) {
    for (const [k, v] of Object.entries(respuesta)) {
      if (patron.test(k.replace(/[_\s]/g, '')) && typeof v === 'string' && v.trim()) {
        out[campo] = v.trim();
        break;
      }
    }
  }
  return out;
}
