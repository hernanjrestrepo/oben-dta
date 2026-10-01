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

/**
 * País a partir de la dirección de destino que manda Oben: la última parte
 * ("2144 FRENCH SETTLEMENT RD, Dallas TX 75212, USA" → "USA"). Hernán: "si
 * tienes la ciudad de destino ya sabes cuál es el país".
 */
export function paisDeDireccion(direccion: string | null | undefined): string | null {
  const ultima = (direccion ?? '').split(',').pop()?.trim() ?? '';
  return /^[A-Za-zÁÉÍÓÚÑáéíóúñ .]{2,30}$/.test(ultima) ? ultima : null;
}

export function defaultsDeOben(respuesta: Record<string, unknown> | null | undefined): DefaultsDeOben {
  const out: DefaultsDeOben = {};
  if (!respuesta || typeof respuesta !== 'object') return out;
  for (const [campo, patron] of PATRONES) {
    for (const [k, v] of Object.entries(respuesta)) {
      if (patron.test(k.replace(/[_\s]/g, '')) && typeof v === 'string' && v.trim()) {
        // Oben manda la dirección en varias líneas ("2144 FRENCH SETTLEMENT RD\r\nDallas TX 75212\r\nUSA"):
        // en un campo de una línea quedaría pegada, así que se une con comas.
        out[campo] = v.trim().replace(/\s*[\r\n]+\s*/g, ', ');
        break;
      }
    }
  }
  return out;
}
