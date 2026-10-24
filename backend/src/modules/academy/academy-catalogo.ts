/**
 * Xmart Academy (Hernán, 23-oct): el contenido de entrenamiento de Oben Xmart. Una sola fuente para la pantalla, los
 * quizzes (se califican aquí, las respuestas nunca salen al navegador) y MIA.
 *
 * Cada módulo corresponde a una opción del menú (`frontend/src/lib/menu.ts`) y repite sus permisos: `ver` define a
 * quién se le asigna (plan por perfil) y `operar` qué acciones transaccionales se habilitan al aprobar el quiz. Si
 * cambia un permiso en el menú, se cambia aquí también (lo verifica academy-catalogo.spec.ts contra el menú).
 *
 * `version` sube cuando cambia el contenido de forma que haya que volver a estudiarlo; `revisado` es la fecha en que
 * se revisó contra la pantalla real y `fuentes` las carpetas del código de esa pantalla: si el código cambió después
 * de `revisado`, el panel de fricciones lo marca "contenido por revisar".
 */

export interface PasoAcademy {
  titulo: string;
  detalle: string;
}

export interface MarcaCaptura {
  /** Posición del marcador sobre la captura, en % del ancho y del alto. */
  x: number;
  y: number;
  titulo: string;
  texto: string;
}

export interface CapturaAcademy {
  /** Archivo en frontend/public/academy/ (si aún no existe, la pantalla muestra la ilustración del módulo). */
  archivo: string;
  titulo: string;
  marcas: MarcaCaptura[];
}

export interface PreguntaQuiz {
  id: string;
  pregunta: string;
  opciones: string[];
  /** Índice de la opción correcta. NUNCA sale al navegador. */
  correcta: number;
  /** Se muestra después de responder: por qué es así. */
  explicacion: string;
}

export interface ModuloAcademy {
  key: string;
  /** Ruta de la pantalla en Oben Xmart (botón "Ir al módulo"). */
  href: string | null;
  titulo: string;
  grupo: 'Fundamentos' | 'Inicio' | 'Comercial' | 'Despacho y facturación' | 'Reportes' | 'Configuración';
  /** Una línea: qué es. */
  resumen: string;
  /** Para qué sirve y quién lo usa, en lenguaje de negocio. */
  paraQue: string;
  quienes: string[];
  pasos: PasoAcademy[];
  reglas: string[];
  capturas: CapturaAcademy[];
  quiz: PreguntaQuiz[];
  /** Permisos de la opción del menú (iguales a menu.ts). Vacío = para todos. */
  ver: string[];
  operar: string[];
  /** Prefijos de la API de esta pantalla: los errores ahí cuentan como fricción del módulo. */
  api: string[];
  /** Palabras con que la gente pregunta por este módulo (para atribuir las preguntas a MIA). */
  claves: string[];
  version: number;
  revisado: string;
  fuentes: string[];
  minutos: number;
}

const ORDENES = { ver: ['orders.read'], operar: ['orders.create', 'orders.update', 'orders.delete', 'orders.approve', 'orders.cancel'] };
const FACTURAS = { ver: ['invoices.read'], operar: ['invoices.create', 'invoices.update', 'invoices.send'] };
const CONFIGURACION = { ver: ['configuracion.read'], operar: ['configuracion.update'] };

export const ACADEMY_INTRO = {
  queEs: {
    titulo: 'Qué es Oben Xmart',
    texto:
      'Oben Xmart es la plataforma que automatiza el recorrido de un pedido de Oben Group: desde que llega la orden de compra del cliente hasta que sale la factura. Se conecta con el ERP de Oben (OBEN MAS), con el correo corporativo y con los archivos de COMEX, y hace sola el trabajo repetitivo: arma la proforma, genera y envía la Lista de Empaque con sus documentos, calcula la liquidación de exportación con las tarifas vigentes, pide la factura y avisa a cada área. Las personas se concentran en decidir y aprobar; el sistema hace el resto y deja trazabilidad de todo.',
    pilares: [
      { titulo: 'Datos reales de Oben', texto: 'Todo sale del ERP de Oben en vivo. Lo que es de prueba o simulado se marca siempre en pantalla y en los correos.' },
      { titulo: 'Automatización con control', texto: 'Lo rutinario corre solo; lo que compromete a Oben (aprobar una liquidación, facturar) pasa por una persona o por reglas explícitas.' },
      { titulo: 'Trazabilidad', texto: 'Cada correo, factura, cambio de ruta y aprobación queda registrado: quién, cuándo y por qué.' },
      { titulo: 'MIA, la asistente', texto: 'Responde sobre el estado de órdenes, facturas y liquidaciones, y arma documentos (PDF, Excel, Word) con los datos que el perfil de cada persona puede ver.' },
    ],
  },
  paradixe: {
    titulo: 'Quién es Paradixe',
    texto:
      'Paradixe es la empresa que diseña, construye y opera Oben Xmart. Trabaja con los equipos de Oben (Comercial, Planeación, Despacho, COMEX y Facturación) para convertir sus procesos en flujos automáticos, medibles y seguros. Paradixe mantiene la plataforma, atiende los cambios y usa la información de Xmart Academy (dónde se equivoca la gente, qué pregunta) para mejorar la experiencia cada semana.',
    url: 'https://paradixe.xyz',
  },
  recorrido: [
    { key: 'oc', titulo: 'Llega la orden de compra', texto: 'El cliente envía su OC por correo. Oben Xmart la lee, reconoce al cliente y sus referencias (equivalencias) y abre un caso en Comercial.', modulo: 'comercial' },
    { key: 'pf', titulo: 'Proforma en OBEN MAS', texto: 'Comercial revisa y confirma: Oben Xmart crea la proforma (PF) y la orden de venta (OV) en OBEN MAS con las APIs de Oben.', modulo: 'comercial' },
    { key: 'cubicaje', titulo: 'Cubicaje', texto: 'Planeación cubica la proforma. El correo "Cubicación de Proforma #N" de OBEN MAS confirma que ya se hizo y el caso sigue solo.', modulo: 'comercial' },
    { key: 'corte', titulo: 'OV aprobada en corte', texto: 'Producción termina y Oben aprueba la OV en corte. Llega el correo "OV N Aprobada En Corte": ese es el disparador del despacho.', modulo: 'lista-empaque' },
    { key: 'documentos', titulo: 'Lista de Empaque y documentos', texto: 'Oben Xmart arma los 6 documentos (Lista Especial, empaque unificada y detallada, consumos de MP y ME, hoja de costos) y los envía a la lista de distribución. Nunca sale incompleto. En exportación espera la aprobación de COMEX.', modulo: 'lista-empaque' },
    { key: 'liquidacion', titulo: 'Liquidación de exportación', texto: 'Si el pedido es de exportación, Oben Xmart calcula la liquidación (flete, seguro, otros gastos, FOB final) con el tarifario vigente y avisa a COMEX para que la revise.', modulo: 'facturacion' },
    { key: 'aprobacion', titulo: 'COMEX aprueba', texto: 'COMEX revisa la ruta y los valores y aprueba. Al aprobar sale el correo "Se realizó revisión de liquidación de COMEX" con proforma, Lista de Empaque y liquidación, y salen las Listas de Empaque que esperaban.', modulo: 'facturacion' },
    { key: 'factura', titulo: 'Factura', texto: 'Nacional: se factura lo programado en el cuadro del día al cerrar la orden. Exportación: se pide la factura al aprobar COMEX. Facturación recibe el aviso con el PDF o con la explicación de qué pasó.', modulo: 'facturas-parciales' },
    { key: 'trazabilidad', titulo: 'Seguimiento', texto: 'Todo queda en Auditoría, en el Centro de Operaciones y en MIA: cualquier persona puede preguntar en qué va una orden.', modulo: 'operaciones' },
  ],
  glosario: [
    { termino: 'OC', definicion: 'Orden de compra del cliente. Con ella empieza todo.', modulo: 'comercial' },
    { termino: 'PF (Proforma)', definicion: 'Documento comercial de Oben con cliente, productos, precios, Incoterm y término de pago. Tiene número oficial (el que se usa para seguimiento) y un código interno en OBEN MAS.', modulo: 'comercial' },
    { termino: 'OV (Orden de venta)', definicion: 'La orden de producción y despacho asociada a una PF. Una PF puede tener varias OV.', modulo: 'orders' },
    { termino: 'Aprobada en corte', definicion: 'Estado de la OV cuando Oben confirma que está lista para despachar. Dispara la Lista de Empaque.', modulo: 'lista-empaque' },
    { termino: 'Lista Especial', definicion: 'Lista de empaque detallada para clientes de EE. UU. (3 hojas, 25 columnas, ancho en pulgadas entero).', modulo: 'lista-empaque' },
    { termino: 'Incoterm', definicion: 'Regla internacional (2020) que define hasta dónde paga y responde Oben: EXW, FCA, FOB, CFR, CIF, CPT, CIP, DAP, DPU, DDP. Define qué conceptos se liquidan.', modulo: 'facturacion' },
    { termino: 'Liquidación', definicion: 'Reparto del valor de la mercancía entre FOB, flete, seguro y otros gastos, por línea, para la factura de exportación.', modulo: 'facturacion' },
    { termino: 'Pata 2', definicion: 'Flete marítimo: del puerto de embarque en Colombia al puerto de destino, por agente y naviera.', modulo: 'facturacion' },
    { termino: 'Pata 3', definicion: 'Transporte terrestre en destino (Inland) y gastos de importación (Entry Fee, ISF, HMF) y comisión aduanera.', modulo: 'facturacion' },
    { termino: 'FOB final', definicion: 'Valor de la mercancía sin flete, seguro ni otros gastos. Precio final × kilos.', modulo: 'facturacion' },
    { termino: 'HMF / ISF / Entry Fee', definicion: 'Cargos de importación de EE. UU.: Harbor Maintenance Fee (0,125 % del FOB), Importer Security Filing (45) y Entry Fee (120).', modulo: 'facturacion' },
    { termino: 'Tarifario', definicion: 'El Excel de fletes de COMEX (patas 2 y 3) con vigencia. Se sube en Liquidación; la tarifa que COMEX escoge queda guardada aunque llegue un tarifario nuevo.', modulo: 'facturacion' },
    { termino: 'Cuadro del día', definicion: 'El Excel de seguimiento diario de Oben (SharePoint) con lo que se factura hoy. Corte a las 4 p. m.', modulo: 'facturas-parciales' },
    { termino: 'Distribución', definicion: 'Número que Oben asigna a una factura parcial ("Facturar Parcial"). Con la PF identifica qué facturar.', modulo: 'facturas-parciales' },
    { termino: 'Cartera (PND)', definicion: 'Regla de cartera: si el cliente no está liberado, la Lista de Empaque no se genera.', modulo: 'lista-empaque' },
    { termino: 'Simulado', definicion: 'Dato o documento de prueba. Siempre se marca [SIMULADO] y nunca llega a Oben como real.', modulo: 'operaciones' },
    { termino: 'Perfil', definicion: 'Conjunto de opciones del menú que ve una persona y si solo consulta (lectura) o también opera (transaccional).', modulo: 'perfiles' },
    { termino: 'Lista de distribución', definicion: 'Grupo de correos que recibe un envío automático (Lista de Empaque, Facturación, COMEX…).', modulo: 'distribucion' },
    { termino: 'Cuadro de integración', definicion: 'Certificado de integración de materias primas de la Zona Franca: consumo, desperdicio y valor por insumo de cada orden exportada.', modulo: 'cuadro-integracion' },
  ],
};

export const MODULOS_ACADEMY: ModuloAcademy[] = [
  {
    key: 'bienvenida',
    href: null,
    titulo: 'Bienvenida a Oben Xmart',
    grupo: 'Fundamentos',
    resumen: 'Qué es Oben Xmart, quién es Paradixe y cómo viaja un pedido de punta a punta.',
    paraQue: 'Es el punto de partida para todos: entender el recorrido completo de un pedido hace que cada pantalla tenga sentido. Después de esta lección sabrás qué hace el sistema solo, qué decides tú y a quién le llega cada correo.',
    quienes: ['Todas las personas con acceso a Oben Xmart'],
    pasos: [
      { titulo: 'Recorre el viaje del pedido', detalle: 'En la portada de Xmart Academy, pasa por cada parada del recorrido: OC → Proforma → Cubicaje → Aprobada en corte → Documentos → Liquidación → Aprobación COMEX → Factura.' },
      { titulo: 'Identifica tu parte', detalle: 'Ubica en qué paradas actúas tú según tu cargo. Tu plan de estudio ya trae los módulos de tu perfil.' },
      { titulo: 'Conoce las señales', detalle: 'Verde = dato real de Oben. Ámbar [SIMULADO] = dato de prueba. Rojo = algo bloquea el proceso y la pantalla dice qué hacer.' },
      { titulo: 'Pregunta a MIA', detalle: 'El botón con la O de Oben abre a MIA. Pregúntale en qué va una orden o cómo se hace algo.' },
    ],
    reglas: [
      'Lo que está en Oben Xmart sale del ERP de Oben en vivo: no se digita lo que Oben ya tiene.',
      'Nada simulado llega a Oben ni a un cliente como si fuera real.',
      'Lo que compromete a Oben (aprobar, facturar) siempre tiene una regla o una persona responsable.',
      'Todo queda en Auditoría: quién, cuándo y por qué.',
    ],
    capturas: [],
    quiz: [
      { id: 'b1', pregunta: '¿Qué correo de Oben dispara la generación de la Lista de Empaque?', opciones: ['La orden de compra del cliente', '"OV N Aprobada En Corte"', '"Cubicación de Proforma #N"', 'El cuadro del día'], correcta: 1, explicacion: 'Cuando Oben aprueba la OV en corte, Oben Xmart arma y envía los documentos de despacho.' },
      { id: 'b2', pregunta: 'Un correo dice [SIMULADO] en el asunto. ¿Qué significa?', opciones: ['Que es urgente', 'Que tiene datos de prueba y no es un documento real', 'Que lo envió MIA', 'Que falta aprobarlo'], correcta: 1, explicacion: 'Lo simulado siempre se marca para que nadie lo confunda con un documento real.' },
      { id: 'b3', pregunta: 'En exportación, ¿qué tiene que pasar para que salga la Lista de Empaque y se pida la factura?', opciones: ['Que Comercial la reenvíe', 'Que COMEX apruebe la liquidación', 'Que llegue el cuadro del día', 'Nada: sale siempre al aprobar en corte'], correcta: 1, explicacion: 'Desde el 23-oct, los correos de exportación esperan la aprobación de COMEX.' },
      { id: 'b4', pregunta: '¿Quién construye y mantiene Oben Xmart?', opciones: ['El área de sistemas de Oben', 'Paradixe', 'El proveedor del ERP', 'COMEX'], correcta: 1, explicacion: 'Paradixe diseña, construye y opera la plataforma con los equipos de Oben.' },
    ],
    ver: [],
    operar: [],
    api: [],
    claves: ['oben xmart', 'paradixe', 'recorrido', 'cómo funciona', 'proceso'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: [],
    minutos: 6,
  },
  {
    key: 'mia',
    href: null,
    titulo: 'MIA, tu asistente',
    grupo: 'Fundamentos',
    resumen: 'Cómo preguntarle a MIA y pedirle documentos con gráficas y tablas.',
    paraQue: 'MIA responde con los datos reales de Oben que tu perfil puede ver: estado de una orden o proforma, facturas del día, liquidaciones, listas de empaque enviadas. También arma documentos (PDF, Excel o Word) con tablas y gráficas con la marca de Oben Group.',
    quienes: ['Todas las personas con acceso a Oben Xmart'],
    pasos: [
      { titulo: 'Ábrela', detalle: 'Haz clic en el botón con la O de Oben, abajo a la derecha, en cualquier pantalla.' },
      { titulo: 'Pregunta con números', detalle: 'Di el número de la OV o la PF: "¿En qué va la OV 11433?", "¿Se facturó la PF 11599?".' },
      { titulo: 'Pide documentos', detalle: '"Hazme un PDF con las facturas de hoy y una gráfica por cliente" o "un Excel con las listas de empaque de la semana".' },
      { titulo: 'Pregunta cómo se hace', detalle: '"¿Cómo cambio el flete de una liquidación?" MIA responde con lo de Xmart Academy y te lleva al módulo.' },
    ],
    reglas: [
      'MIA solo ve lo que tu perfil puede ver.',
      'Una vista previa de factura de Oben Xmart no es una factura del ERP: MIA lo distingue.',
      'Si MIA no sabe algo o el dato no existe en Oben, lo dice; no inventa.',
    ],
    capturas: [],
    quiz: [
      { id: 'm1', pregunta: '¿Qué datos puede mostrarte MIA?', opciones: ['Todos los de Oben', 'Solo los que tu perfil puede ver', 'Solo los de hoy', 'Solo los simulados'], correcta: 1, explicacion: 'MIA usa los mismos permisos de tu perfil.' },
      { id: 'm2', pregunta: '¿Cuál es la mejor forma de preguntar por un pedido?', opciones: ['"¿Cómo va lo de ayer?"', '"¿En qué va la OV 11433?"', '"¿Hay algo pendiente?"', 'No se puede preguntar por pedidos'], correcta: 1, explicacion: 'Con el número de la OV o PF, MIA consulta el dato exacto.' },
      { id: 'm3', pregunta: '¿Qué formatos puede generar MIA?', opciones: ['Solo texto en el chat', 'PDF, Excel y Word con tablas y gráficas', 'Solo Excel', 'Solo imágenes'], correcta: 1, explicacion: 'MIA arma documentos con la marca de Oben Group.' },
    ],
    ver: [],
    operar: [],
    api: ['/eva'],
    claves: ['mia', 'asistente', 'chat', 'pdf', 'gráfica'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: ['backend/src/modules/eva', 'frontend/src/components/layout/EvaWidget.tsx'],
    minutos: 4,
  },
  {
    key: 'operaciones',
    href: '/operaciones',
    titulo: 'Centro de Operaciones',
    grupo: 'Inicio',
    resumen: 'El estado en vivo de todas las integraciones y procesos automáticos.',
    paraQue: 'Muestra si las conexiones con Oben (ERP, correo, SharePoint) están funcionando, qué procesos automáticos corrieron, cuáles esperan datos de Oben y qué falló. Es la primera pantalla a mirar cuando alguien dice "no llegó el correo".',
    quienes: ['Coordinadores', 'Administradores', 'Paradixe'],
    pasos: [
      { titulo: 'Revisa el semáforo de conexiones', detalle: 'Verde = conectado. Ámbar = lento o con reintentos. Rojo = caído: los procesos esperan y se reintentan solos.' },
      { titulo: 'Mira lo que espera datos', detalle: 'Órdenes cuyos documentos no salen porque Oben aún no registra consumos o costos: se reintentan cada hora hasta 48 h.' },
      { titulo: 'Abre el detalle', detalle: 'Cada evento lleva a la orden o a la auditoría con el porqué.' },
    ],
    reglas: [
      'Una orden incompleta nunca sale: espera y se reintenta sola.',
      'Si algo sigue sin salir tras 5 intentos, se avisa por correo a José y Jorge.',
    ],
    capturas: [],
    quiz: [
      { id: 'o1', pregunta: 'Una Lista de Empaque no ha salido porque Oben no tiene la hoja de costos. ¿Qué hace el sistema?', opciones: ['La envía sin la hoja de costos', 'Espera y reintenta cada hora hasta 48 h, y avisa', 'La descarta', 'Le pide a Comercial que la envíe'], correcta: 1, explicacion: 'Nunca se envía incompleta: se reintenta y se escala.' },
      { id: 'o2', pregunta: '¿Dónde miras primero cuando alguien reporta que no llegó un correo?', opciones: ['En el Dashboard', 'En el Centro de Operaciones', 'En Perfiles', 'En Equivalencias'], correcta: 1, explicacion: 'El Centro de Operaciones muestra conexiones, procesos y esperas.' },
    ],
    ver: ['dashboard.view'],
    operar: [],
    api: ['/integrations', '/document-flow', '/health'],
    claves: ['centro de operaciones', 'integraciones', 'conexión', 'no llegó'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: ['frontend/src/app/(app)/operaciones'],
    minutos: 4,
  },
  {
    key: 'dashboard',
    href: '/dashboard',
    titulo: 'Dashboard',
    grupo: 'Inicio',
    resumen: 'Resumen de operaciones y métricas clave.',
    paraQue: 'Da la foto del negocio en una pantalla: órdenes activas, documentos enviados, facturas y tendencias. Sirve para reuniones de seguimiento y para detectar a tiempo lo que se está acumulando.',
    quienes: ['Gerencia', 'Coordinadores'],
    pasos: [
      { titulo: 'Lee los indicadores', detalle: 'Las tarjetas superiores resumen el periodo; haz clic para ver el detalle.' },
      { titulo: 'Compara tendencias', detalle: 'Las gráficas muestran la evolución por día y por cliente.' },
      { titulo: 'Pide a MIA el informe', detalle: '"Hazme un PDF con los indicadores de esta semana" arma el reporte con gráficas.' },
    ],
    reglas: ['Los indicadores se calculan con los datos registrados en Oben Xmart y en Oben.'],
    capturas: [],
    quiz: [
      { id: 'd1', pregunta: '¿Cómo obtienes los indicadores del Dashboard en un PDF para una reunión?', opciones: ['Tomando pantallazos', 'Pidiéndoselo a MIA', 'No se puede', 'Exportando desde Perfiles'], correcta: 1, explicacion: 'MIA arma el PDF con gráficas y tablas.' },
    ],
    ver: ['dashboard.view'],
    operar: [],
    api: ['/dashboard'],
    claves: ['dashboard', 'indicadores', 'métricas'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: ['frontend/src/app/(app)/dashboard', 'backend/src/modules/dashboard'],
    minutos: 3,
  },
  {
    key: 'comercial',
    href: '/comercial',
    titulo: 'Comercial',
    grupo: 'Comercial',
    resumen: 'De la orden de compra del cliente a la proforma y la orden de venta en OBEN MAS.',
    paraQue: 'Cada orden de compra que llega por correo se convierte en un caso: Oben Xmart reconoce al cliente y sus referencias, propone la proforma con la parametrización comercial del cliente (condición, Incoterm, moneda, puerto) y, al confirmar, crea la PF y la OV en OBEN MAS. El CRM muestra cada caso por etapa con días en la etapa y semáforo.',
    quienes: ['Comercial', 'Customer Service'],
    pasos: [
      { titulo: 'Revisa el caso nuevo', detalle: 'En el CRM, la tarjeta del caso muestra cliente, OC y líneas. Si una referencia no se reconoce, se corrige en Equivalencias.' },
      { titulo: 'Confirma la proforma', detalle: 'Verifica cantidades, precios y condiciones y confirma: se crea la PF (número oficial) y la OV en OBEN MAS.' },
      { titulo: 'Sigue el cubicaje', detalle: 'Cuando Planeación cubica, el correo de OBEN MAS mueve el caso solo a "Cubicada".' },
      { titulo: 'Registra el número de la OV', detalle: 'Oben no lo devuelve por API: en el recuadro de OBEN MAS escribe el número y guárdalo.' },
    ],
    reglas: [
      'El número oficial de la PF es el que se usa para todo el seguimiento.',
      'Un caso simulado lo dice en cada botón: no crea nada en Oben.',
      'Si la película no tiene Lead Time en Planeación, Oben no deja activar la OV: hay que pedir que lo creen.',
      'Si cartera no está liberada, el caso queda "Retenido en cartera".',
    ],
    capturas: [],
    quiz: [
      { id: 'c1', pregunta: '¿Qué número de proforma se usa para hacer seguimiento?', opciones: ['El código interno de OBEN MAS', 'El número oficial de la PF', 'El número de la OC', 'El número de la OV'], correcta: 1, explicacion: 'El número oficial es el que usan Comercial y todas las áreas.' },
      { id: 'c2', pregunta: 'Una referencia de la OC no se reconoce. ¿Dónde se corrige?', opciones: ['En Clientes', 'En Equivalencias', 'En Perfiles', 'En Fletes'], correcta: 1, explicacion: 'Equivalencias traduce la referencia del cliente a la película de Oben.' },
      { id: 'c3', pregunta: '¿Qué mueve el caso a "Cubicada"?', opciones: ['Un clic de Comercial', 'El correo "Cubicación de Proforma #N" de OBEN MAS', 'La aprobación de COMEX', 'El cuadro del día'], correcta: 1, explicacion: 'Ese correo es la confirmación real del cubicaje.' },
      { id: 'c4', pregunta: 'La OV no se pudo activar: "No existe Lead Time Production para la película". ¿Qué hay que hacer?', opciones: ['Reintentar muchas veces', 'Pedir a Planeación que cree el Lead Time de esa película', 'Cambiar el cliente', 'Crear otra proforma'], correcta: 1, explicacion: 'Oben exige el Lead Time de la película antes de activar la OV.' },
    ],
    ...ORDENES,
    api: ['/comercial', '/purchase-orders'],
    claves: ['comercial', 'proforma', 'orden de compra', 'oc', 'crm', 'caso', 'cubicaje'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: ['frontend/src/app/(app)/comercial', 'backend/src/modules/comercial'],
    minutos: 8,
  },
  {
    key: 'quotes',
    href: '/quotes',
    titulo: 'Cotizaciones',
    grupo: 'Comercial',
    resumen: 'Pipeline correo → cotización → pago → producción → entrega.',
    paraQue: 'Registra las solicitudes de cotización que llegan por correo y las sigue hasta la entrega, con el flete estimado del tarifario.',
    quienes: ['Comercial'],
    pasos: [
      { titulo: 'Abre la solicitud', detalle: 'Cada correo de cotización queda como una tarjeta en el pipeline.' },
      { titulo: 'Arma la cotización', detalle: 'Completa productos y cantidades; el flete sale del tarifario vigente.' },
      { titulo: 'Avanza las etapas', detalle: 'Mueve la cotización según el estado: enviada, pagada, en producción, entregada.' },
    ],
    reglas: ['El flete de una cotización usa las tarifas vigentes del tarifario.'],
    capturas: [],
    quiz: [
      { id: 'q1', pregunta: '¿De dónde sale el flete de una cotización?', opciones: ['Se digita siempre', 'Del tarifario vigente', 'De la factura anterior', 'De MIA'], correcta: 1, explicacion: 'El tarifario de fletes es la fuente.' },
      { id: 'q2', pregunta: '¿Por dónde entra una solicitud de cotización?', opciones: ['Por correo', 'Por WhatsApp', 'Solo a mano', 'Por el cuadro del día'], correcta: 0, explicacion: 'El pipeline arranca en el correo del cliente.' },
    ],
    ver: ['quotes.read'],
    operar: ['quotes.create', 'quotes.update', 'quotes.approve', 'quotes.delete'],
    api: ['/quotes'],
    claves: ['cotización', 'cotizaciones', 'quote'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: ['frontend/src/app/(app)/quotes', 'backend/src/modules/quotes'],
    minutos: 4,
  },
  {
    key: 'orders',
    href: '/orders',
    titulo: 'Órdenes',
    grupo: 'Comercial',
    resumen: 'Las órdenes de venta con su estado, documentos y trazabilidad.',
    paraQue: 'Lista las órdenes de venta y muestra para cada una qué documentos salieron, a quién, cuándo, y en qué va su facturación. Es el expediente de la orden.',
    quienes: ['Comercial', 'Customer Service', 'Despacho'],
    pasos: [
      { titulo: 'Busca la orden', detalle: 'Por número de OV, PF o cliente.' },
      { titulo: 'Revisa el expediente', detalle: 'Documentos enviados, destinatarios, estado de la liquidación y de la factura.' },
      { titulo: 'Reenvía si hace falta', detalle: 'Desde el detalle se puede reenviar un documento a una persona puntual.' },
    ],
    reglas: ['Comercial, Órdenes, Lista de Empaque y Reportes comparten permisos: lo que se habilita en una se habilita en las demás.'],
    capturas: [],
    quiz: [
      { id: 'or1', pregunta: '¿Qué encuentras en el detalle de una orden?', opciones: ['Solo el cliente', 'Documentos enviados, destinatarios, liquidación y factura', 'Solo la factura', 'Nada, es un listado'], correcta: 1, explicacion: 'El detalle es el expediente completo de la OV.' },
      { id: 'or2', pregunta: 'Si te habilitan operar en Órdenes, ¿qué más queda habilitado?', opciones: ['Nada más', 'Comercial, Lista de Empaque y Reportes (comparten permisos)', 'Facturas', 'Perfiles'], correcta: 1, explicacion: 'Esas opciones usan los mismos permisos de órdenes.' },
    ],
    ...ORDENES,
    api: ['/orders'],
    claves: ['orden de venta', 'ov', 'órdenes', 'expediente'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: ['frontend/src/app/(app)/orders', 'backend/src/modules/orders'],
    minutos: 4,
  },
  {
    key: 'clients',
    href: '/clients',
    titulo: 'Clientes',
    grupo: 'Comercial',
    resumen: 'Directorio de clientes, crédito y preferencias.',
    paraQue: 'Centraliza los datos de cada cliente: código en Oben, contactos, crédito, dirección de entrega y las preferencias que se aplican solas (por ejemplo, el texto que va junto a la partida en la factura).',
    quienes: ['Comercial', 'Customer Service', 'Cartera'],
    pasos: [
      { titulo: 'Busca o carga clientes', detalle: 'Se pueden cargar desde Excel/CSV o editar uno a uno.' },
      { titulo: 'Revisa el código de Oben', detalle: 'El código del cliente en OBEN MAS es el que une todo (proformas, parametrización, facturas).' },
      { titulo: 'Ajusta preferencias', detalle: 'Lo que COMEX o Facturación dejan por cliente se aplica en las próximas órdenes.' },
    ],
    reglas: ['Sin código de Oben el cliente no se puede usar para crear proformas.'],
    capturas: [],
    quiz: [
      { id: 'cl1', pregunta: '¿Qué dato une al cliente de Oben Xmart con OBEN MAS?', opciones: ['El correo', 'El código del cliente en Oben', 'El nombre', 'El país'], correcta: 1, explicacion: 'El código de Oben es la llave con el ERP.' },
    ],
    ver: ['clients.read'],
    operar: ['clients.create', 'clients.update', 'clients.delete'],
    api: ['/clients'],
    claves: ['cliente', 'clientes', 'crédito', 'cartera'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: ['frontend/src/app/(app)/clients', 'backend/src/modules/clients'],
    minutos: 3,
  },
  {
    key: 'equivalencias',
    href: '/equivalencias',
    titulo: 'Equivalencias',
    grupo: 'Comercial',
    resumen: 'Traduce las referencias del cliente a las películas de Oben.',
    paraQue: 'Cada cliente pide con sus propias referencias ("BOPP 20", "POLIESTER 12"). Equivalencias las traduce al código de película de Oben (por ejemplo SC---0020TN) para que la proforma se arme sola.',
    quienes: ['Comercial'],
    pasos: [
      { titulo: 'Carga o edita la tabla', detalle: 'Desde Excel/CSV o una a una: referencia del cliente → código de Oben.' },
      { titulo: 'Corrige lo que no se reconoce', detalle: 'Cuando una OC trae una referencia nueva, agrégala aquí y el caso se actualiza.' },
    ],
    reglas: ['Una referencia sin equivalencia detiene la creación de la proforma de esa línea.'],
    capturas: [],
    quiz: [
      { id: 'e1', pregunta: '¿Para qué sirve Equivalencias?', opciones: ['Para convertir monedas', 'Para traducir la referencia del cliente a la película de Oben', 'Para los perfiles', 'Para las tarifas'], correcta: 1, explicacion: 'Sin equivalencia no se puede armar la proforma sola.' },
    ],
    ver: ['products.read'],
    operar: ['products.create', 'products.update', 'products.delete'],
    api: ['/equivalences', '/products'],
    claves: ['equivalencia', 'referencia', 'película', 'producto'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: ['frontend/src/app/(app)/equivalencias', 'backend/src/modules/equivalences'],
    minutos: 3,
  },
  {
    key: 'lista-empaque',
    href: '/lista-empaque',
    titulo: 'Lista de Empaque',
    grupo: 'Despacho y facturación',
    resumen: 'Los documentos de despacho que salen solos cuando Oben aprueba la OV en corte.',
    paraQue: 'Al llegar "OV N Aprobada En Corte", Oben Xmart arma los 6 documentos (Lista Especial, empaque unificada, empaque detallada, consumo de materia prima, consumo de material de empaque y hoja de costos) y los envía a la lista de distribución. Esta pantalla muestra qué se envió, qué espera datos y permite ver o reenviar cada documento.',
    quienes: ['Despacho', 'Customer Service', 'COMEX'],
    pasos: [
      { titulo: 'Busca la OV', detalle: 'Mira si salió, a quién y con qué documentos.' },
      { titulo: 'Si espera, mira por qué', detalle: '"Esperando datos de Oben" (consumos o costos), "Retenida en cartera" o "Espera la aprobación de COMEX" (exportación).' },
      { titulo: 'Descarga o reenvía', detalle: 'Cada documento se puede descargar; el reenvío manual no confirma nada a Oben.' },
    ],
    reglas: [
      'Nunca se envía con documentos faltantes: se reintenta y, si no, se escala.',
      'Exportación: el correo sale solo cuando COMEX aprueba la liquidación. Nacional: sale al aprobar en corte.',
      'Si cartera no libera al cliente, no se genera nada.',
      'La Lista Especial lleva 25 columnas y el ancho en pulgadas entero.',
    ],
    capturas: [],
    quiz: [
      { id: 'l1', pregunta: 'Llega "OV 11433 Aprobada En Corte" de un pedido a Ecuador y COMEX no ha aprobado la liquidación. ¿Qué pasa?', opciones: ['Sale la Lista de Empaque de una vez', 'Se avisa a COMEX y el correo espera la aprobación', 'Se factura', 'Se descarta'], correcta: 1, explicacion: 'Exportación espera la aprobación de COMEX.' },
      { id: 'l2', pregunta: 'Y si es un pedido nacional?', opciones: ['Espera a COMEX', 'Sale de una vez (nacional no lleva liquidación)', 'Espera el cuadro del día', 'Se envía simulado'], correcta: 1, explicacion: 'Los nacionales no requieren liquidación.' },
      { id: 'l3', pregunta: 'Oben aún no tiene la hoja de costos de la orden. ¿Qué hace el sistema?', opciones: ['Envía los otros 5', 'No envía nada y reintenta; si sigue, escala', 'Inventa los costos', 'Borra la orden'], correcta: 1, explicacion: 'Nunca se envía incompleto.' },
      { id: 'l4', pregunta: '¿Cuántos documentos lleva el paquete de la Lista de Empaque?', opciones: ['1', '3', '6', '10'], correcta: 2, explicacion: 'Lista Especial, unificada, detallada, consumo MP, consumo ME y hoja de costos.' },
    ],
    ...ORDENES,
    api: ['/packing-list', '/oben-reports'],
    claves: ['lista de empaque', 'packing list', 'lista especial', 'documentos', 'aprobada en corte'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: ['frontend/src/app/(app)/lista-empaque', 'backend/src/modules/packing-list', 'backend/src/modules/oben-reports'],
    minutos: 7,
  },
  {
    key: 'facturacion',
    href: '/facturacion',
    titulo: 'Liquidación y Facturación',
    grupo: 'Despacho y facturación',
    resumen: 'La liquidación de exportación: ruta, tarifas, revisión y aprobación de COMEX.',
    paraQue: 'Para cada proforma de exportación, Oben Xmart calcula la liquidación con los precios y kilos del ERP y el tarifario vigente: flete marítimo (pata 2), transporte terrestre y gastos en destino (pata 3), seguro y FOB final por línea. COMEX revisa, puede cambiar la ruta (siempre del tarifario, con justificación y soportes) y aprueba. Al aprobar, todo sigue solo: salen los correos y se pide la factura.',
    quienes: ['COMEX', 'Facturación'],
    pasos: [
      { titulo: 'Escoge la proforma', detalle: 'Arriba aparecen las proformas de exportación listas para COMEX; las demás se buscan por número. "Ver proforma" muestra la PF tal como está en OBEN MAS.' },
      { titulo: 'Revisa el tarifario', detalle: 'La tarjeta "Tarifario de fletes" muestra el vigente. Al subir uno nuevo, el sistema pide fecha de vigencia y de expiración.' },
      { titulo: 'Revisa el flete marítimo', detalle: 'Arriba sale la tarifa escogida (la sugerida es la más barata vigente). Las demás opciones están en el desplegable. Si escoges otra, aplica con justificación y adjunta el soporte.' },
      { titulo: 'Si falta una tarifa', detalle: 'Debajo del flete, "Tarifas fuera del tarifario" permite agregar una con su vigencia: queda como opción para todas las liquidaciones a ese destino.' },
      { titulo: 'Revisa la pata 3', detalle: 'Transportador terrestre y agente aduanero: el escogido arriba, los demás en el desplegable.' },
      { titulo: 'Aprueba', detalle: 'El botón verde "Aprobar liquidación (COMEX)". Al aprobar: salen las Listas de Empaque que esperaban, el correo "Se realizó revisión de liquidación de COMEX" (proforma, lista de empaque y liquidación) y se pide la factura.' },
    ],
    reglas: [
      'Las tarifas salen del tarifario: nada se digita.',
      'La tarifa que COMEX escoge es histórica: un tarifario nuevo no le cambia el valor.',
      'Cada cambio de ruta queda como orden de compra interna: quién, cuándo, antes → después, sobrecosto y motivo.',
      'Si algo cambia después de aprobar, hay que aprobar de nuevo.',
      'La suma FOB + flete + seguro + otros nunca queda por debajo del valor de la mercancía: el ajuste es de 0,0001 en el precio unitario (nunca se toca el flete en dólares).',
      'La factura de exportación se pide UNA vez por PF; si Oben la rechaza no se reintenta sola.',
    ],
    capturas: [],
    quiz: [
      { id: 'f1', pregunta: '¿De dónde salen las tarifas de flete que puede escoger COMEX?', opciones: ['Se digitan en la liquidación', 'Del tarifario (o de las tarifas agregadas con el botón +)', 'De la factura anterior', 'De MIA'], correcta: 1, explicacion: 'COMEX escoge del tarifario; lo que no está se agrega con el botón + y su vigencia.' },
      { id: 'f2', pregunta: 'COMEX escogió una tarifa de 630 y después se cargó un tarifario donde esa tarifa vale 700. ¿Cuánto queda en la liquidación?', opciones: ['700', '630: la selección es histórica', 'El promedio', 'Se vuelve a la sugerida'], correcta: 1, explicacion: 'La tarifa escogida se guarda tal como estaba al escogerla.' },
      { id: 'f3', pregunta: '¿Qué pasa apenas COMEX aprueba?', opciones: ['Nada, hay que ir a "Continuar al envío"', 'Salen las Listas de Empaque que esperaban, el correo de revisión y se pide la factura', 'Se borra la liquidación', 'Se envía al cliente'], correcta: 1, explicacion: 'Ya no hay más pasos en pantalla: al aprobar todo sigue solo.' },
      { id: 'f4', pregunta: 'Al subir un tarifario nuevo, ¿qué pide el sistema?', opciones: ['Nada', 'La fecha de vigencia y la de expiración', 'La aprobación de Facturación', 'El número de la PF'], correcta: 1, explicacion: 'Las fechas del tarifario son obligatorias y reemplazan las del Excel.' },
      { id: 'f5', pregunta: 'Cambiaste el agente aduanero después de aprobar. ¿Qué sigue?', opciones: ['Nada', 'Aprobar de nuevo: la aprobación anterior ya no vale', 'Llamar a Paradixe', 'Subir otro tarifario'], correcta: 1, explicacion: 'La aprobación vale para exactamente esos valores.' },
    ],
    ver: ['exportations.read', 'invoices.read'],
    operar: ['exportations.liquidate', 'exportations.approve', 'invoices.send'],
    api: ['/liquidacion', '/facturacion', '/freight-rates'],
    claves: ['liquidación', 'comex', 'flete', 'tarifario', 'incoterm', 'aprobar', 'pata 2', 'pata 3', 'inland', 'exportación'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: ['frontend/src/app/(app)/facturacion', 'backend/src/modules/liquidacion', 'backend/src/modules/freight-rates'],
    minutos: 12,
  },
  {
    key: 'cuadro-integracion',
    href: '/cuadro-integracion',
    titulo: 'Cuadro de integración',
    grupo: 'Despacho y facturación',
    resumen: 'El certificado de integración de materias primas de la Zona Franca, por orden.',
    paraQue: 'Arma el cuadro que antes se hacía a mano en Excel: por cada orden exportada, los insumos nacionales y extranjeros con su consumo, desperdicio, regranulado, valor y participación, en el formato del certificado de la Zona Franca.',
    quienes: ['COMEX', 'Comercio exterior'],
    pasos: [
      { titulo: 'Busca la orden', detalle: 'Escribe la OV y revisa el cuadro.' },
      { titulo: 'Revisa el origen de los datos', detalle: 'Mientras Oben no entregue autorizaciones con saldo y subpartida por insumo, esas partes se marcan como pendientes.' },
      { titulo: 'Descarga el Excel', detalle: 'Sale en el formato del certificado.' },
    ],
    reglas: [
      'Materia prima: cantidad = consumo × (1 + % desperdicio + % regranulado).',
      'Lo que no viene de Oben se marca: nunca se inventa.',
    ],
    capturas: [],
    quiz: [
      { id: 'ci1', pregunta: '¿Cómo se calcula la cantidad de una materia prima en el cuadro?', opciones: ['Consumo', 'Consumo × (1 + % desperdicio + % regranulado)', 'Consumo − desperdicio', 'Valor / precio'], correcta: 1, explicacion: 'Es la fórmula verificada contra el certificado 51590.' },
    ],
    ver: ['exportations.read'],
    operar: [],
    api: ['/cuadro-integracion'],
    claves: ['cuadro de integración', 'zona franca', 'certificado', 'insumos'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: ['frontend/src/app/(app)/cuadro-integracion', 'backend/src/modules/cuadro-integracion'],
    minutos: 4,
  },
  {
    key: 'facturas-parciales',
    href: '/facturas-parciales',
    titulo: 'Facturas parciales',
    grupo: 'Despacho y facturación',
    resumen: 'La facturación automática: el cuadro del día, los parciales y cada llamada a Oben.',
    paraQue: 'Oben Xmart pide las facturas a Oben por API: nacionales según el cuadro del día (SharePoint) al cerrar la orden, parciales al llegar el correo "Facturar Parcial" y exportación al aprobar COMEX. Esta pantalla carga el cuadro, muestra cada solicitud con su resultado y explica cada falla.',
    quienes: ['Facturación'],
    pasos: [
      { titulo: 'Carga el cuadro del día', detalle: 'Antes de las 4 p. m., desde el Excel de seguimiento diario. Solo se factura lo programado.' },
      { titulo: 'Revisa las solicitudes', detalle: 'Facturada, Rechazada, En espera de aprobación en Oben, Por revisar en OBEN MAS, Ya estaba facturada.' },
      { titulo: 'Atiende lo "Por revisar"', detalle: 'Oben no confirmó: verifica en OBEN MAS si la factura existe antes de confirmar un último intento.' },
      { titulo: 'Reenvía el aviso', detalle: 'El aviso con el PDF (o la explicación) se puede reenviar a una persona.' },
    ],
    reglas: [
      'Una sola llamada por solicitud y como máximo una al día por proforma y distribución.',
      'Máximo 25 llamadas al día; tras 3 seguidas sin factura, la facturación se suspende sola y avisa.',
      'Un rechazo de Oben no se reintenta solo.',
      'Clientes bloqueados (p. ej. OBEN DISTRIBUIDORA) no se piden por API hasta que Oben lo resuelva.',
      'Sin cuadro cargado para el día no se factura nada nacional.',
    ],
    capturas: [],
    quiz: [
      { id: 'fp1', pregunta: 'Son las 3 p. m. y no se ha cargado el cuadro del día. ¿Qué se factura de lo nacional?', opciones: ['Todo lo cerrado', 'Nada: hay que cargar el cuadro', 'Solo los parciales', 'Lo de ayer'], correcta: 1, explicacion: 'Con facturación programada, sin cuadro no se factura nacional.' },
      { id: 'fp2', pregunta: 'Una solicitud quedó "Por revisar en OBEN MAS". ¿Qué haces?', opciones: ['Reintentar de una', 'Verificar en OBEN MAS si existe antes de confirmar otro intento', 'Borrarla', 'Pedirle a COMEX'], correcta: 1, explicacion: 'Oben pudo haberla creado: reintentar a ciegas la duplicaría.' },
      { id: 'fp3', pregunta: 'Oben rechazó una factura. ¿Se reintenta sola?', opciones: ['Sí, cada 15 minutos', 'No', 'Sí, al día siguiente', 'Solo si es exportación'], correcta: 1, explicacion: 'Desde el 23-oct un rechazo no se reintenta solo.' },
      { id: 'fp4', pregunta: '¿Cuándo se suspende sola la facturación?', opciones: ['Nunca', 'Tras 3 llamadas seguidas sin factura', 'A las 4 p. m.', 'Los viernes'], correcta: 1, explicacion: 'Es el freno automático para no dañar consecutivos en Oben.' },
    ],
    ...FACTURAS,
    api: ['/facturacion/parciales', '/facturacion-programada'],
    claves: ['factura', 'facturar', 'parcial', 'cuadro del día', 'distribución', 'rechazada'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: ['frontend/src/app/(app)/facturas-parciales', 'backend/src/modules/facturacion'],
    minutos: 8,
  },
  {
    key: 'invoices',
    href: '/invoices',
    titulo: 'Facturas',
    grupo: 'Despacho y facturación',
    resumen: 'Las facturas de las órdenes y su representación en PDF.',
    paraQue: 'Muestra las facturas con su vista previa en el formato DIAN de Oben (FV nacional y FEXP de exportación): partida, observaciones, totales en letras y, para nacionales en dólares, los totales en pesos con la TRM.',
    quienes: ['Facturación'],
    pasos: [
      { titulo: 'Busca la factura', detalle: 'Por PF, OV o cliente.' },
      { titulo: 'Abre la vista previa', detalle: 'Es una representación de Oben Xmart: la factura fiscal es la de OBEN MAS.' },
    ],
    reglas: ['Una vista previa no es la factura del ERP.', 'Facturas y Facturas parciales comparten permisos.'],
    capturas: [],
    quiz: [
      { id: 'i1', pregunta: 'La vista previa de una factura en Oben Xmart, ¿es la factura fiscal?', opciones: ['Sí', 'No: la fiscal es la de OBEN MAS', 'Solo en exportación', 'Solo si la aprueba COMEX'], correcta: 1, explicacion: 'Oben Xmart representa; OBEN MAS emite.' },
    ],
    ...FACTURAS,
    api: ['/invoices'],
    claves: ['facturas', 'pdf factura', 'fexp', 'fv'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: ['frontend/src/app/(app)/invoices', 'backend/src/modules/invoices'],
    minutos: 3,
  },
  {
    key: 'fletes',
    href: '/fletes',
    titulo: 'Fletes',
    grupo: 'Despacho y facturación',
    resumen: 'Consulta de las tarifas de flete cargadas.',
    paraQue: 'Permite consultar las tarifas marítimas e Inland vigentes y vencidas por destino, agente y naviera, sin entrar a una liquidación.',
    quienes: ['COMEX', 'Comercial'],
    pasos: [
      { titulo: 'Filtra por destino', detalle: 'Puerto o ciudad de destino.' },
      { titulo: 'Compara', detalle: 'Valor por contenedor de 40 pies, días de tránsito y vigencia.' },
    ],
    reglas: ['El tarifario se sube en Liquidación y Facturación, con vigencia.'],
    capturas: [],
    quiz: [
      { id: 'fl1', pregunta: '¿Dónde se sube un tarifario nuevo?', opciones: ['En Fletes', 'En Liquidación y Facturación', 'En Perfiles', 'Se le envía a MIA'], correcta: 1, explicacion: 'La tarjeta "Tarifario de fletes" está en Liquidación y Facturación.' },
    ],
    ver: ['quotes.read'],
    operar: [],
    api: ['/freight-rates/inland', '/freight-rates/transload'],
    claves: ['fletes', 'tarifa', 'naviera', 'agente'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: ['frontend/src/app/(app)/fletes'],
    minutos: 2,
  },
  {
    key: 'reportes',
    href: '/reportes',
    titulo: 'Reportes Oben',
    grupo: 'Reportes',
    resumen: 'Los reportes de Oben por orden: empaque, consumos, costos.',
    paraQue: 'Genera a demanda cualquiera de los reportes de una orden (los mismos del paquete de la Lista de Empaque) para consultarlos o descargarlos.',
    quienes: ['Despacho', 'COMEX', 'Costos'],
    pasos: [
      { titulo: 'Escribe la OV', detalle: 'Y escoge el reporte.' },
      { titulo: 'Descarga', detalle: 'Excel o PDF según el reporte.' },
    ],
    reglas: ['Si Oben no tiene datos del reporte para esa orden, la pantalla lo dice.'],
    capturas: [],
    quiz: [
      { id: 'r1', pregunta: 'Un reporte dice "Oben no tiene datos de este reporte para esta orden". ¿Qué significa?', opciones: ['Que Oben Xmart está caído', 'Que Oben aún no registró esa información para la orden', 'Que no tienes permiso', 'Que es simulado'], correcta: 1, explicacion: 'Pasa con consumos y costos antes de que Oben los registre.' },
    ],
    ...ORDENES,
    api: [],
    claves: ['reportes', 'consumo', 'hoja de costos', 'empaque unificada'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: ['frontend/src/app/(app)/reportes'],
    minutos: 2,
  },
  {
    key: 'distribucion',
    href: '/distribucion',
    titulo: 'Listas de Distribución',
    grupo: 'Configuración',
    resumen: 'Quién recibe cada correo automático.',
    paraQue: 'Define los destinatarios de cada envío (Lista de Empaque, Facturación, COMEX, escalamientos). Cada lista tiene dueños que pueden cambiar sus destinatarios.',
    quienes: ['Dueños de cada lista', 'Administradores'],
    pasos: [
      { titulo: 'Abre la lista', detalle: 'Por ejemplo "Facturación — Oben Xmart".' },
      { titulo: 'Agrega o quita destinatarios', detalle: 'Para, CC o CCO.' },
      { titulo: 'Revisa a qué envío está asociada', detalle: 'Una lista sin asociación no recibe nada.' },
    ],
    reglas: ['Los dueños cambian destinatarios; crear o borrar listas exige el permiso de configuración.', 'Si una lista no tiene destinatarios, el envío no sale y queda registrado.'],
    capturas: [],
    quiz: [
      { id: 'di1', pregunta: 'COMEX debe recibir el correo de revisión de liquidación. ¿Dónde se configura?', opciones: ['En Perfiles', 'En Listas de Distribución (lista "liquidacion_cierre")', 'En Formatos', 'En MIA'], correcta: 1, explicacion: 'Las listas definen quién recibe cada envío.' },
    ],
    ver: ['dashboard.view'],
    operar: ['configuracion.update'],
    api: ['/distribution-lists'],
    claves: ['lista de distribución', 'destinatarios', 'correo a'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: ['frontend/src/app/(app)/distribucion', 'backend/src/modules/distribution-lists'],
    minutos: 3,
  },
  {
    key: 'formatos',
    href: '/formatos',
    titulo: 'Formatos de correo',
    grupo: 'Configuración',
    resumen: 'El asunto y el texto de cada correo automático.',
    paraQue: 'Permite cambiar el asunto y el cuerpo de los correos automáticos con variables (OV, cliente…). Si no se define un formato, sale el texto de siempre.',
    quienes: ['Administradores'],
    pasos: [
      { titulo: 'Escoge el envío', detalle: 'Por ejemplo, Lista de Empaque.' },
      { titulo: 'Edita con variables', detalle: 'Usa {ov}, {cliente}… y revisa la vista previa.' },
    ],
    reglas: ['Un correo simulado siempre lo dice, aunque el formato no lo incluya.'],
    capturas: [],
    quiz: [
      { id: 'fo1', pregunta: 'Si no se define formato para un envío, ¿qué sale?', opciones: ['Nada', 'El texto de siempre', 'Un error', 'Un correo vacío'], correcta: 1, explicacion: 'Sin formato, el sistema usa el texto por defecto.' },
    ],
    ...CONFIGURACION,
    api: ['/formatos'],
    claves: ['formato', 'asunto', 'plantilla'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: ['frontend/src/app/(app)/formatos', 'backend/src/modules/formatos'],
    minutos: 2,
  },
  {
    key: 'auditoria',
    href: '/auditoria',
    titulo: 'Auditoría',
    grupo: 'Configuración',
    resumen: 'La trazabilidad de todo lo que pasa en Oben Xmart.',
    paraQue: 'Registra cada evento de negocio: correos enviados, facturas pedidas, aprobaciones, cambios de ruta, cambios de perfil. Responde "quién hizo qué, cuándo y por qué".',
    quienes: ['Administradores', 'Coordinadores'],
    pasos: [
      { titulo: 'Filtra', detalle: 'Por fecha, acción, orden o usuario.' },
      { titulo: 'Abre el evento', detalle: 'Muestra los datos de entrada y salida y el motivo.' },
    ],
    reglas: ['La auditoría no se edita ni se borra.'],
    capturas: [],
    quiz: [
      { id: 'a1', pregunta: '¿Dónde averiguas quién aprobó una liquidación y cuándo?', opciones: ['En Auditoría', 'En Fletes', 'En Formatos', 'En Equivalencias'], correcta: 0, explicacion: 'Cada aprobación queda en Auditoría.' },
    ],
    ver: ['auditoria.read'],
    operar: [],
    api: ['/auditoria'],
    claves: ['auditoría', 'quién', 'trazabilidad', 'historial'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: ['frontend/src/app/(app)/auditoria'],
    minutos: 2,
  },
  {
    key: 'conexiones',
    href: '/conexiones',
    titulo: 'Conexión Microsoft 365',
    grupo: 'Configuración',
    resumen: 'El buzón y los archivos de Microsoft 365 que usa Oben Xmart.',
    paraQue: 'Muestra el estado de la conexión con el buzón de pedidos (de donde llegan los correos de Oben) y con SharePoint (el cuadro del día).',
    quienes: ['Administradores', 'Paradixe'],
    pasos: [{ titulo: 'Revisa el estado', detalle: 'Buzón y SharePoint: conectado o con el error y qué hacer.' }],
    reglas: ['Sin la conexión al buzón no se detectan los correos de Oben (aprobada en corte, facturar parcial, cubicación).'],
    capturas: [],
    quiz: [
      { id: 'cx1', pregunta: '¿Qué deja de funcionar si se cae la conexión al buzón?', opciones: ['Nada', 'La detección de los correos de Oben (aprobada en corte, parciales, cubicación)', 'Los perfiles', 'MIA'], correcta: 1, explicacion: 'Los disparadores llegan por correo.' },
    ],
    ver: ['integrations.read'],
    operar: [],
    api: ['/conexiones'],
    claves: ['microsoft', 'buzón', 'sharepoint', 'conexión'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: ['frontend/src/app/(app)/conexiones', 'backend/src/modules/conexiones'],
    minutos: 2,
  },
  {
    key: 'usuarios',
    href: '/admin/users',
    titulo: 'Usuarios',
    grupo: 'Configuración',
    resumen: 'Crear usuarios, asignar perfiles, bloquear o reiniciar contraseñas.',
    paraQue: 'Administra quién entra a Oben Xmart y con qué perfil. Al crear un usuario o reiniciar su contraseña, la persona debe cambiarla en su primer ingreso.',
    quienes: ['Administradores'],
    pasos: [
      { titulo: 'Crea el usuario', detalle: 'Nombre, correo y contraseña temporal (botón Generar).' },
      { titulo: 'Asigna el perfil', detalle: 'El perfil define el menú y su plan en Xmart Academy.' },
      { titulo: 'Bloquea o desactiva', detalle: 'Cuando alguien sale o hay un riesgo.' },
    ],
    reglas: ['La contraseña temporal obliga a cambiarla antes de hacer cualquier cosa.', 'El plan de Xmart Academy de cada persona sale de su perfil.'],
    capturas: [],
    quiz: [
      { id: 'u1', pregunta: 'Creaste un usuario con contraseña temporal. ¿Qué pasa en su primer ingreso?', opciones: ['Entra normal', 'Debe cambiarla antes de hacer cualquier cosa', 'Queda bloqueado', 'Recibe un SMS'], correcta: 1, explicacion: 'Nada de negocio hasta cambiarla.' },
    ],
    ver: ['users.read'],
    operar: ['users.create', 'users.update', 'users.delete'],
    api: ['/users'],
    claves: ['usuario', 'contraseña', 'crear usuario', 'bloquear'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: ['frontend/src/app/(app)/admin/users'],
    minutos: 3,
  },
  {
    key: 'perfiles',
    href: '/admin/roles',
    titulo: 'Perfiles',
    grupo: 'Configuración',
    resumen: 'Qué ve cada perfil y si solo consulta o también opera.',
    paraQue: 'Los perfiles se arman igual que el menú: para cada opción, Sin acceso, Solo lectura o Transaccional. Lo que se marca aquí define también el plan de estudio en Xmart Academy y qué quizzes debe aprobar cada persona para operar.',
    quienes: ['Administradores'],
    pasos: [
      { titulo: 'Abre el perfil', detalle: 'Por ejemplo "Analista Comercio Exterior".' },
      { titulo: 'Marca el nivel por opción', detalle: 'Sin acceso / Solo lectura / Transaccional. Las opciones que comparten permiso cambian juntas y la pantalla lo avisa.' },
      { titulo: 'Guarda', detalle: 'Aplica a todas las personas con ese perfil en su próximo ingreso.' },
    ],
    reglas: [
      'Comercial, Órdenes, Lista de Empaque y Reportes comparten permisos; Facturas y Facturas parciales también.',
      'Con la certificación obligatoria activa, lo transaccional se habilita solo al aprobar el quiz del módulo en Xmart Academy.',
    ],
    capturas: [],
    quiz: [
      { id: 'p1', pregunta: '¿Qué niveles tiene cada opción del menú en un perfil?', opciones: ['Ver y borrar', 'Sin acceso, Solo lectura y Transaccional', 'Básico y avanzado', 'Uno solo'], correcta: 1, explicacion: 'Los perfiles se arman igual que el menú.' },
      { id: 'p2', pregunta: 'Con la certificación obligatoria activa, ¿cuándo puede operar alguien con perfil transaccional?', opciones: ['De inmediato', 'Al aprobar el quiz del módulo en Xmart Academy', 'Cuando lo diga MIA', 'Nunca'], correcta: 1, explicacion: 'El quiz con el puntaje mínimo habilita lo transaccional.' },
    ],
    ver: ['security.read'],
    operar: ['security.create', 'security.update', 'security.delete'],
    api: ['/security'],
    claves: ['perfil', 'perfiles', 'permisos', 'rol'],
    version: 1,
    revisado: '2026-10-23',
    fuentes: ['frontend/src/app/(app)/admin/roles', 'frontend/src/lib/menu.ts'],
    minutos: 4,
  },
];

export const MODULO_POR_KEY = new Map(MODULOS_ACADEMY.map((m) => [m.key, m]));

/** Módulos del plan de una persona: los de su perfil (puede ver la opción) más los de fundamentos. */
export function planDe(permisos: ReadonlySet<string>): ModuloAcademy[] {
  return MODULOS_ACADEMY.filter((m) => m.ver.every((p) => permisos.has(p)));
}

/** El quiz es obligatorio cuando la persona puede operar algo de ese módulo. */
export function quizObligatorio(m: ModuloAcademy, permisos: ReadonlySet<string>): boolean {
  return m.operar.some((p) => permisos.has(p));
}

/** Módulo al que pertenece una ruta de la API (para atribuir errores y fricciones). */
export function moduloDeRuta(ruta: string): string | null {
  const limpia = ruta.split('?')[0].replace(/^\/api/, '');
  let mejor: { key: string; largo: number } | null = null;
  for (const m of MODULOS_ACADEMY) {
    for (const p of m.api) {
      if (limpia === p || limpia.startsWith(`${p}/`)) {
        if (!mejor || p.length > mejor.largo) mejor = { key: m.key, largo: p.length };
      }
    }
  }
  return mejor?.key ?? null;
}

/** Contenido para el navegador: el quiz sin las respuestas. */
export function sinRespuestas(m: ModuloAcademy) {
  return { ...m, quiz: m.quiz.map(({ id, pregunta, opciones }) => ({ id, pregunta, opciones })) };
}

const sinTildes = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Módulo del que habla una pregunta (por sus palabras clave), o null. Para atribuir las preguntas a MIA. */
export function moduloDePregunta(texto: string): string | null {
  const t = sinTildes(texto);
  let mejor: { key: string; puntos: number } | null = null;
  for (const m of MODULOS_ACADEMY) {
    const puntos = m.claves.reduce((n, c) => n + (t.includes(sinTildes(c)) ? c.length : 0), 0);
    if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { key: m.key, puntos };
  }
  return mejor?.key ?? null;
}

/** Lo que MIA lee de la Academy para responder "cómo se hace": las lecciones más afines y los términos del glosario. */
export function buscarEnAcademy(pregunta: string, modulo?: string | null) {
  const t = sinTildes(pregunta);
  const palabras = t.split(/[^a-z0-9ñ]+/).filter((w) => w.length > 3);
  const puntaje = (m: ModuloAcademy) => {
    const texto = sinTildes([m.titulo, m.resumen, m.paraQue, ...m.pasos.map((p) => `${p.titulo} ${p.detalle}`), ...m.reglas, ...m.claves].join(' '));
    return (m.key === modulo ? 1000 : 0) + m.claves.reduce((n, c) => n + (t.includes(sinTildes(c)) ? 20 : 0), 0) + palabras.reduce((n, w) => n + (texto.includes(w) ? 1 : 0), 0);
  };
  const modulos = MODULOS_ACADEMY.map((m) => ({ m, p: puntaje(m) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p)
    .slice(0, 2)
    .map(({ m }) => ({ key: m.key, titulo: m.titulo, pantalla: m.href, resumen: m.resumen, paraQue: m.paraQue, pasos: m.pasos, reglas: m.reglas }));
  const glosario = ACADEMY_INTRO.glosario.filter((g) => t.includes(sinTildes(g.termino.split(' ')[0])) || palabras.some((w) => sinTildes(g.termino).includes(w))).slice(0, 4);
  return { modulos, glosario };
}
