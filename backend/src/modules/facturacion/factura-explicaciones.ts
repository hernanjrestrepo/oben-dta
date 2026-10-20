import type { EstadoFacturaParcial } from '../../entities/factura-parcial.entity';

/**
 * Explicación en lenguaje claro de por qué una factura no se pudo crear (pedido de Hernán, 20-oct: "cuando no se
 * pueda generar una factura necesito una explicación clara y detallada, no me sirve 'error tal o cual'").
 * Pura y sin dependencias: el correo de aviso y la pantalla la usan igual.
 */
export interface ContextoFalla {
  numberPF: string;
  /** Vacío = pedido completo. */
  numeroDistribucion?: string;
  cliente?: string | null;
  ov?: number | null;
  /** Otras proformas que ya fallaron con el MISMO mensaje de Oben (para mostrar el patrón). */
  otrasConMismoError?: string[];
}

export interface ExplicacionFalla {
  /** Frase corta para el asunto/encabezado. */
  titulo: string;
  queOcurrio: string;
  queSignifica: string;
  queSeHace: string[];
  /** true = se puede volver a pedir cuando se corrija la causa. */
  reintentable: boolean;
  /** El mensaje original, solo para soporte. */
  tecnico: string;
}

const NO_SE_PUDO_CREAR = /No se pudo crear la factura de venta/i;
const EN_ESPERA = /se encuentra en estado:\s*Aprobaci[oó]n pendiente/i;
const OTRA_INSTANCIA = /otra instancia|ya (?:ha sido|fue) procesad/i;
const SIN_RESPUESTA = /abort|timeout|timed out|tiempo de espera|sin respuesta|An error has occurred|sin confirmaci[oó]n de [eé]xito|ECONN|socket|fetch failed/i;
const NO_NACIONAL = /EXPORTACI[OÓ]N|no se pudo confirmar que la PF|solo se facturan pedidos nacionales/i;
const SUSPENDIDA = /suspendida/i;

function etiqueta(c: ContextoFalla): string {
  const dist = c.numeroDistribucion ? ` (distribución ${c.numeroDistribucion})` : ' (pedido completo)';
  const ov = c.ov ? `, orden de venta ${c.ov}` : '';
  const cli = c.cliente ? `, cliente ${c.cliente}` : '';
  return `proforma ${c.numberPF}${dist}${ov}${cli}`;
}

function patron(c: ContextoFalla): string {
  const otras = (c.otrasConMismoError ?? []).filter((p) => p && p !== c.numberPF);
  if (otras.length === 0) return '';
  const lista = [...new Set(otras)].slice(0, 12).join(', ');
  return ` Este mismo rechazo ya ocurrió con otras ${otras.length} proformas (${lista}). Cuando se repite en varias, lo más probable es un tema común (del cliente, de su parametrización o de una regla del ERP de Oben) y no de esta proforma en particular.`;
}

export function explicarFalla(estado: EstadoFacturaParcial, errorTexto: string | null, ctx: ContextoFalla): ExplicacionFalla {
  const texto = (errorTexto ?? '').trim();
  const tecnico = texto || '(Oben no entregó ningún mensaje)';
  const que = etiqueta(ctx);

  if (SUSPENDIDA.test(texto)) {
    return {
      titulo: 'La facturación está suspendida',
      queOcurrio: `No se pidió la factura de la ${que} porque la facturación automática está suspendida.`,
      queSignifica: 'Es una decisión de Oben/Paradixe, no un fallo: mientras esté suspendida no se envía ninguna factura a Oben.',
      queSeHace: ['Cuando se dé la orden de reactivar, se factura lo programado para ese día.'],
      reintentable: true,
      tecnico,
    };
  }

  if (NO_NACIONAL.test(texto)) {
    return {
      titulo: 'No se factura: no es un pedido nacional confirmado',
      queOcurrio: `No se pidió la factura de la ${que}.`,
      queSignifica:
        'Por decisión de Oben (7-oct) solo se facturan pedidos nacionales (Colombia). Los de exportación se facturan después de la liquidación aprobada por COMEX, y si Oben no confirma el país de la proforma tampoco se factura (ante la duda no se crea una factura fiscal).',
      queSeHace: ['Si el pedido sí es nacional, confirmar el país de la proforma en OBEN MAS y volver a pedirla.', 'Si es de exportación, seguir el proceso de liquidación.'],
      reintentable: false,
      tecnico,
    };
  }

  if (EN_ESPERA.test(texto)) {
    return {
      titulo: 'La proforma aún espera aprobación en Oben',
      queOcurrio: `Oben respondió que la ${que} se encuentra en estado "Aprobación pendiente".`,
      queSignifica: 'No es un rechazo: Oben todavía no ha aprobado internamente la proforma y por eso no deja facturarla.',
      queSeHace: ['El sistema vuelve a pedirla solo cada 15 minutos (hasta 48 horas); en cuanto Oben la apruebe se factura y llega el aviso.', 'Si urge, pedir en Oben que aprueben la proforma.'],
      reintentable: true,
      tecnico,
    };
  }

  if (OTRA_INSTANCIA.test(texto)) {
    return {
      titulo: 'Oben dice que ya procesó esta solicitud',
      queOcurrio: `Al pedir la factura de la ${que}, Oben respondió que la solicitud "ya ha sido procesada en otra instancia".`,
      queSignifica:
        'Oben recibió antes una solicitud igual (por ejemplo la nuestra anterior, que no alcanzó a responder a tiempo) y ya la procesó. Lo más probable es que la factura SÍ exista, pero Oben no lo confirma de forma clara.',
      queSeHace: ['Buscar la proforma en OBEN MAS: si ya tiene factura, no hay que hacer nada más.', 'No repetir la solicitud hasta verificarlo, para no duplicar la factura.'],
      reintentable: false,
      tecnico,
    };
  }

  if (NO_SE_PUDO_CREAR.test(texto)) {
    return {
      titulo: 'Oben no aceptó crear la factura',
      queOcurrio: `Pedimos a Oben crear la factura de la ${que}. La API de Oben recibió la solicitud y la rechazó con el mensaje "No se pudo crear la factura de venta, validar los parámetros suministrados o no son válidos". No se creó ninguna factura.`,
      queSignifica:
        'Oben Xmart solo le entrega a Oben el número de proforma (y de distribución si es parcial); el resto de la factura (cliente, precios, impuestos, retenciones, cantidades) lo arma el ERP de Oben con los datos que tiene de esa proforma. Si el ERP no puede armarla (falta o es inválido algún dato de la proforma, del cliente o de la orden), responde este error y no dice cuál dato es. Por eso desde Oben Xmart no se puede saber la causa exacta.' + patron(ctx),
      queSeHace: [
        `José (Oben) debe revisar en el ERP qué dato impide crear la factura de la proforma ${ctx.numberPF}; la API no devuelve el motivo.`,
        'No conviene reintentar hasta que Oben corrija ese dato: repetir la solicitud da el mismo rechazo.',
        'Cuando Oben avise que está corregido, se reintenta con el botón "Reintentar" de la pantalla Facturas.',
      ],
      reintentable: true,
      tecnico,
    };
  }

  if (estado === 'revisar' || SIN_RESPUESTA.test(texto)) {
    const sinNada = /An error has occurred|sin confirmaci[oó]n/i.test(texto);
    return {
      titulo: 'No sabemos si Oben creó la factura',
      queOcurrio: sinNada
        ? `Pedimos a Oben crear la factura de la ${que} y su respuesta no confirmó si la creó (contestó un error genérico, sin explicación). Por seguridad volvimos a preguntar una vez y el resultado siguió sin aclararse.`
        : `Pedimos a Oben crear la factura de la ${que} y Oben no respondió dentro de 90 segundos. Por seguridad esperamos unos segundos y volvimos a preguntar una vez; tampoco respondió a tiempo.`,
      queSignifica:
        'Es lentitud o una falla de comunicación del lado de Oben, no un rechazo. Oben a veces crea la factura y aun así tarda o contesta con error, por eso la factura PUEDE existir. Como no podemos saberlo, el sistema no repite la creación por su cuenta: repetirla a ciegas podría duplicar la factura.',
      queSeHace: [
        `Buscar la proforma ${ctx.numberPF} en OBEN MAS: si ya tiene factura no hay que hacer nada; si no existe, reintentar con el botón de la pantalla Facturas (confirmando que se verificó).`,
        'Si Oben vuelve a responder lento, avisar a José: la API tarda demasiado para esa proforma.',
      ],
      reintentable: true,
      tecnico,
    };
  }

  return {
    titulo: 'Oben no pudo crear la factura',
    queOcurrio: `Pedimos a Oben crear la factura de la ${que} y respondió con un mensaje que no sabemos clasificar.`,
    queSignifica: 'La API de Oben no dio una causa conocida. La factura no se creó (o no se pudo confirmar).',
    queSeHace: ['Revisar la proforma en OBEN MAS y compartir el mensaje técnico con José para que indique la causa.'],
    reintentable: true,
    tecnico,
  };
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Bloque HTML para el correo de aviso. */
export function explicacionHtml(e: ExplicacionFalla): string {
  return (
    `<p><b>Qué pasó</b><br>${esc(e.queOcurrio)}</p>` +
    `<p><b>Qué significa</b><br>${esc(e.queSignifica)}</p>` +
    `<p><b>Qué se hace</b></p><ul>${e.queSeHace.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` +
    `<p style="color:#6b7280;font-size:12px">Detalle técnico (para soporte): ${esc(e.tecnico)}</p>`
  );
}
