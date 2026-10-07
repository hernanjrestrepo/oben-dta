// API Types for Oben-DTA Frontend

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  tenantId?: string | null;
  tenantSlug?: string | null;
  isSuperAdmin?: boolean;
  permissions?: string[];
  /** Entró con una contraseña temporal: debe cambiarla antes de usar el sistema. */
  mustChangePassword?: boolean;
}

export interface IntegrationStatus {
  system: string;
  mode: 'real' | 'mock';
  state: 'operational' | 'pending_credentials' | 'unreachable' | 'error' | 'disabled';
  message: string;
  latencyMs: number | null;
}

export interface LicenseStatusView {
  valid: boolean;
  reason: string | null;
  graceActive: boolean;
  daysRemaining: number | null;
  renewalDue: boolean;
  expiresAt: string | null;
  planKey: string | null;
}

export interface CommercialLicense {
  id: string;
  installationId: string;
  status: 'active' | 'suspended' | 'revoked';
  issuedAt: string;
  expiresAt: string;
  gracePeriodDays: number;
  maxUsers: number;
  maxSites: number;
  offline: boolean;
}

// --- Panel SuperAdmin de plataforma ---------------------------------------

export type TenantStatus = 'active' | 'suspended' | 'trial' | 'archived';

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  legalName?: string;
  taxId?: string;
  countryCode: string;
  defaultCurrency: string;
  timezone: string;
  status: TenantStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Plan {
  id: string;
  key: string;
  name: string;
  description?: string;
  priceMonthly: number;
  currency: string;
  maxUsers: number;
  maxStorageGb: number;
  isActive: boolean;
  modules: string[];
}

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';

export interface TenantSubscription {
  id: string;
  tenantId: string;
  planId: string;
  plan?: Plan;
  status: SubscriptionStatus;
  startsAt: string;
  endsAt: string | null;
}

export interface TenantFeatureFlag {
  id: string;
  tenantId: string;
  moduleKey: string;
  enabled: boolean;
  reason: string | null;
  setBy: string | null;
}

export interface PlatformRole {
  id: string;
  key: string;
  name: string;
  description: string | null;
}

export interface PlatformUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  isSuperAdmin: boolean;
  createdAt: string;
  platformRoles: string[];
}

export interface AuditRow {
  id: string;
  tenantId: string | null;
  userId: string | null;
  permissionKey: string | null;
  moduleKey: string | null;
  route: string | null;
  method: string | null;
  ip: string | null;
  granted: boolean;
  deniedReason: string | null;
  createdAt: string;
}

export interface AuditPage {
  total: number;
  page: number;
  pageSize: number;
  items: AuditRow[];
}

export interface SystemStatus {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptimeSeconds: number;
  database: { status: 'ok' | 'error'; migrationsApplied: number };
  tenants: Record<string, number> & { total: number };
  subscriptions: Record<string, number> & { total: number };
  platformUsers: { total: number; active: number; superAdmins: number };
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: User;
  license?: {
    valid: boolean;
    reason: string | null;
    graceActive: boolean;
    daysRemaining: number | null;
    renewalDue: boolean;
  } | null;
}

export interface Client {
  id: string;
  clientId: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  creditLimit: number;
  usedCredit: number;
  isActive: boolean;
  /** Código del cliente en OBEN MAS. */
  obenCode?: string | null;
  /** Dominios de correo autorizados (anti-fraude). */
  authorizedDomains?: string[];
  /** Comercial de Oben a cargo. */
  comercialEmail?: string | null;
  finalCustomerInSubject?: boolean;
  createdAt: string;
  updatedAt: string;
  orders?: Order[];
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  isActive: boolean;
}

export interface OrderItem {
  id: string;
  productId: string;
  product?: Product;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export type OrderStatus =
  | 'DRAFT'
  | 'PENDING_VALIDATION'
  | 'CONFIRMED'
  | 'PENDING_PRODUCTION'
  | 'IN_PRODUCTION'
  | 'READY_FOR_DELIVERY'
  | 'DELIVERED'
  | 'BLOCKED'
  | 'CANCELLED';

export interface Order {
  id: string;
  orderNumber: string;
  clientId: string;
  client?: Client;
  totalAmount: number;
  status: OrderStatus;
  notes?: string;
  blockedReason?: string;
  validatedBy?: string;
  validatedAt?: string;
  invoiceNumber?: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderItemDto {
  productId: string;
  quantity: number;
}

export interface CreateOrderDto {
  clientId: string;
  orderNumber: string;
  notes?: string;
  items: CreateOrderItemDto[];
}

export interface UpdateOrderStatusDto {
  status: OrderStatus;
  blockedReason?: string;
  validatedBy?: string;
}

export interface DashboardKPIs {
  totalOrders: number;
  activeOrders: number;
  totalClients: number;
  totalRevenue: number;
  ordersByStatus: Record<string, number>;
  recentOrders: Order[];
}

export interface ApiError {
  statusCode: number;
  message: string;
  timestamp: string;
  path: string;
}


export type InvoiceStatus = 'PENDING' | 'APPROVED' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export type DianStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  orderId: string;
  order?: Order;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  status: InvoiceStatus;
  dianStatus: DianStatus;
  dianCufe?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

// Cotizaciones — pipeline automatizado correo -> cotización -> pago -> producción -> entrega
export type QuoteStatus =
  | 'RECEIVED'
  | 'PARSING'
  | 'QUOTED'
  | 'SENT'
  | 'APPROVED'
  | 'ORDERED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'IN_PRODUCTION'
  | 'READY_FOR_DELIVERY'
  | 'DELIVERED'
  | 'REJECTED';

export interface QuoteItem {
  id: string;
  productId: string;
  product?: Product;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Quote {
  id: string;
  quoteNumber: string;
  clientId: string;
  client?: Client;
  originalEmail?: string | null;
  items: QuoteItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  status: QuoteStatus;
  pdfUrl?: string | null;
  paymentLink?: string | null;
  invoiceNumber?: string | null;
  approvedAt?: string | null;
  paidAt?: string | null;
  deliveredAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InboxEmail {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  receivedAt: string;
  status: 'UNREAD' | 'READ' | 'REPLIED';
  replyText?: string;
  replyAt?: string;
}

export type QuoteFlowOutcome =
  | 'quoted'
  | 'rejected_unknown_client'
  | 'insufficient_info';

export interface QuoteFlowResult {
  quote: Quote | null;
  emailId: string;
  steps: string[];
  outcome: QuoteFlowOutcome;
  message?: string;
}

// --- Demo automático (WO-013 Sprint 6) ---
export interface DemoStep {
  step: string;
  label: string;
  at: string;
  data?: Record<string, unknown>;
}

export interface DemoResult {
  steps: DemoStep[];
  quoteId: string;
  quoteNumber: string;
  orderId: string | null;
  orderNumber: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  total: number;
  durationMs: number;
}

// --- Administración Enterprise (usuarios / perfiles / permisos del tenant) --

export interface TenantUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  isLocked: boolean;
  mustChangePassword?: boolean;
  createdAt: string;
  roles: string[];
}

export interface CreateTenantUserDto {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  roleKeys?: string[];
}

export interface UpdateTenantUserDto {
  firstName?: string;
  lastName?: string;
  email?: string;
  isActive?: boolean;
}

export interface SecurityPermission {
  id: string;
  key: string;
  moduleKey: string;
  action: string;
  name: string;
  description: string | null;
  isPlatform: boolean;
}

export interface SecurityModuleCatalog {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  isActive: boolean;
}

export interface SecurityRole {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissions: SecurityPermission[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoleDto {
  key: string;
  name: string;
  description?: string;
  permissions: string[];
}

export interface UpdateRoleDto {
  name?: string;
  description?: string;
  isActive?: boolean;
  permissions?: string[];
}

// --- Auditoría de negocio (workflow_events) ---------------------------------

export interface WorkflowEvent {
  id: string;
  eventType: string;
  status: string;
  workflowName: string;
  fromState: string;
  toState: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  inputData: Record<string, unknown> | null;
  outputData: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
}

// Fletes — maestro de tarifas real del forwarder de Oben
export interface FreightInlandRate {
  id: string;
  country: 'USA' | 'CA';
  forwarder: string;
  destinationPort: string;
  state: string;
  destinationAddress: string;
  weightLbs: number | null;
  rate40hc: number;
  transitTimeDays: number | null;
  validUntil: string | null;
  sourceFile: string;
  importedAt: string;
}

export interface FreightTransloadRate {
  id: string;
  destinationPort: string | null;
  deliveryAddress: string;
  unitWeightLbs: number | null;
  transloadingRate: number;
  transportationRate: number;
  validityNote: string | null;
  sourceFile: string;
  importedAt: string;
}

export interface FreightDestinationSurcharge {
  id: string;
  country: string;
  surchargeName: string;
  rateAmount: number | null;
  rateFormula: string | null;
  sourceFile: string;
  importedAt: string;
}

export type DistributionRecipientRole = 'to' | 'cc' | 'bcc';

export interface DistributionListRecipientView {
  id: string;
  email: string;
  name: string | null;
  role: DistributionRecipientRole;
}

export type DistributionEntityType = 'document' | 'transaction' | 'report';

export interface DistributionListAssociationView {
  id: string;
  entityType: DistributionEntityType;
  entityKey: string;
}

export type DisparadorLista = 'automatico' | 'manual';

export interface DistributionList {
  id: string;
  name: string;
  description: string | null;
  /** Usuarios dueños: editan destinatarios y disparan "Enviar ahora" (WO-026). */
  ownerUserIds: string[];
  disparador: DisparadorLista;
  recipients: DistributionListRecipientView[];
  associations: DistributionListAssociationView[];
  createdAt: string;
  updatedAt: string;
}

export interface DistributionListInput {
  name: string;
  description?: string;
  recipients: { email: string; name?: string; role: DistributionRecipientRole }[];
  ownerUserIds?: string[];
  disparador?: DisparadorLista;
}

/** Lo que Oben Xmart envía por correo y se puede asociar a una lista. */
export interface EnvioCatalogo {
  clave: string;
  label: string;
  descripcion: string;
  grupo: string;
  /** Se puede disparar con "Enviar ahora" (pide la OV). */
  manual: boolean;
}

export interface EnvioManualResultado {
  enviado: true;
  lista: string;
  documento: string;
  ov: number;
  para: string[];
  copia: string[];
  adjuntos: string[];
  noIncluidos: string[];
}

/** Formato de correo editable (WO-027). */
export interface FormatoEnvio {
  clave: string;
  label: string;
  grupo: string;
  asunto: string;
  cuerpo: string;
  porDefecto: { asunto: string; cuerpo: string };
  personalizado: boolean;
  variables: Array<{ nombre: string; descripcion: string }>;
  actualizado: string | null;
}

/** Solicitud de factura parcial (WO-023). */
export type EstadoFacturaParcial = 'pendiente' | 'facturando' | 'facturada' | 'rechazada' | 'revisar';
export interface FacturaParcial {
  id: string;
  numberPF: string;
  numeroDistribucion: string;
  origen: 'correo' | 'manual';
  remitente: string | null;
  estado: EstadoFacturaParcial;
  respuesta: unknown;
  error: string | null;
  modo: string | null;
  facturadaAt: string | null;
  createdAt: string;
}



// ─── Comercial (reunión 2026-09-23) ─────────────────────────────────────────

export interface Equivalence {
  id: string;
  clientId: string;
  client?: { id: string; name: string; clientId: string };
  clientCode: string;
  obenCode: string;
  description: string | null;
}

export interface TabularImportResult<T = Record<string, unknown>> {
  dryRun: boolean;
  total: number;
  creados: number;
  actualizados: number;
  errores: Array<{ fila: number; error: string }>;
  filas: T[];
}

export interface TabularImportInput {
  rows?: Record<string, unknown>[];
  fileBase64?: string;
  filename?: string;
  dryRun?: boolean;
}

export type CasoEstado =
  | 'oc_recibida'
  | 'sin_cubicar'
  | 'cubicada'
  | 'enviada_cliente'
  | 'retenida'
  | 'activa'
  | 'cerrada'
  | 'rechazada'
  | 'anulada';

export interface CasoLinea {
  n: number;
  textoCliente: string;
  codigoCliente: string | null;
  codigoOben: string | null;
  equivalenciaId: string | null;
  cantidad: number | null;
  unidad: string | null;
  kilos: number | null;
  anchoMm: number | null;
  espesorMicras: number | null;
  precioUnitario: number | null;
  moneda: string | null;
  conversiones: string[];
  faltantes: string[];
}

export interface ComercialCaso {
  id: string;
  estado: CasoEstado;
  clientId: string | null;
  cliente: string | null;
  codigoClienteOben: string | null;
  clienteFinal: string | null;
  contactoEmail: string;
  comercialEmail: string | null;
  ocNumero: string | null;
  ocAsunto: string;
  ocRecibidaEn: string;
  ocAdjuntos: Array<{ filename: string; contentType: string | null; bytes: number; leido: boolean }>;
  extraidoPor: 'reglas' | 'ia';
  tipo: 'nacional' | 'exportacion' | null;
  pais: string | null;
  destino: { direccion: string; ciudad: string | null; pais: string; direccionId: string | null; fuente: string } | null;
  fechaRequerida: string | null;
  lineas: CasoLinea[];
  missing: string[];
  atencion: string[];
  simulated: boolean;
  simulatedItems: string[];
  accionPendiente: { tipo: string; detalle: string; creadaEn: string; lineas?: CasoLinea[] } | null;
  numberPF: string | null;
  numberOrderSales: number | null;
  seguimiento: { tipo: 'firma' | 'cartera' | null; enviados: number; proximoEn: string | null; ultimoEn: string | null };
  fechas: Record<string, string>;
  entregaComprometida: string | null;
  entregaHistorial: Array<{ fecha: string; anterior: string | null; nueva: string | null }>;
  eventos: Array<{ fecha: string; tipo: string; detalle: string; actor?: string | null }>;
  proformaFirmadaNombre: string | null;
}

export interface ComercialTablero {
  simulated: boolean;
  total: number;
  abiertas: number;
  embudo: Record<CasoEstado, number>;
  requierenAtencion: Array<{ id: string; cliente: string | null; ocNumero: string | null; numberPF: string | null; estado: CasoEstado; accionPendiente: string | null; motivos: string[] }>;
  porCliente: Array<{ cliente: string; total: number; abiertas: number }>;
  tiemposPromedioHoras: Record<string, number | null>;
}

export interface ComercialConfig {
  config: {
    habilitado: boolean;
    modo: 'supervisado' | 'automatico';
    seguimientoFirma: { intervalosHoras: number[]; luegoCadaHoras: number | null };
    seguimientoCartera: { intervalosHoras: number[]; luegoCadaHoras: number | null };
    extractor: { provider: string; host?: string; model?: string };
    ejemplosOc: Array<{ entrada: string; salida: unknown }>;
  };
  porDefecto: string[];
}

export interface CarteraHold {
  id: string;
  numberOrderSales: number;
  attempts: number;
  nextRetryAt: string;
  status: string;
  kind: 'cartera' | 'incompleto';
  holdReason: string | null;
  createdAt: string;
}

// ── Facturación (Oben) — espejo de backend/src/modules/facturacion/facturacion.types.ts ──

export type FacturacionKind = 'exportacion' | 'nacional_completo' | 'nacional_parcial';

export interface FacturacionLine {
  codSecLineFilm: number;
  tipoPelicula: string;
  precio: number;
  kilosTotal: number;
  valorLinea: number;
}

export interface FacturacionInput {
  direccionEntrega?: string;
  observaciones?: string;
  infoComercial?: string;
  parcial?: boolean;
}

export interface FacturacionDraft {
  numberOrderSales: number;
  cliente: string;
  pais: string | null;
  proforma: string | null;
  ordenCompra: string | null;
  contenedor: string | null;
  codigoMaterial: string | null;
  kind: FacturacionKind | null;
  direccionEntrega: string | null;
  direccionFuente: 'maestro_clientes' | 'digitada' | 'oben_erp' | 'oben_plus' | null;
  observaciones: string | null;
  infoComercial: string | null;
  lines: FacturacionLine[];
  totalValor: number;
  totalKilos: number;
  missing: string[];
  readyToGenerate: boolean;
  simulated: boolean;
  simulatedFields: string[];
}

export interface FacturaElectronica {
  invoiceNumber: string;
  cufe: string;
  status: string;
  simulated: boolean;
  emitidaEn: string | null;
}

export interface FacturacionEnvio {
  fecha: string;
  to: string[];
  cc: string[];
  ok: boolean;
  cufe: string | null;
  cufeSimulado: boolean;
  error: string | null;
}

export interface FacturacionHistorial {
  numberOrderSales: number;
  envios: FacturacionEnvio[];
  facturaElectronica: FacturaElectronica | null;
}

export interface FacturacionSendResult {
  sent: boolean;
  to: string[];
  cc: string[];
  filename: string;
  cufe: string;
  cufeSimulado: boolean;
  simulated: boolean;
}

export interface OrdenReciente {
  numberOrderSales: number;
  cliente: string | null;
  fecha: string;
}

// ── Liquidación de comercio exterior — espejo de backend/src/modules/liquidacion/liquidacion.types.ts ──

export type ConceptoLiquidacion = 'flete' | 'seguro' | 'otrosGastos';

/** De dónde salió un valor del encabezado: ERP de Oben, maestro de tarifas, calculado o digitado. */
export type OrigenValor = 'oben' | 'maestro' | 'calculado' | 'usuario' | 'provisional';

export interface IncotermRegla {
  codigo: string;
  conceptos: ConceptoLiquidacion[];
}

export interface LiquidacionHeaderValues {
  direccion?: string | null;
  notes?: string | null;
  paNcm?: string | null;
  paNaladi?: string | null;
  description?: string | null;
  puertoArribo?: string | null;
  puertoEmbarque?: string | null;
  inlandFreight?: number | null;
  entryFee?: number | null;
  importerSecurityFiling?: number | null;
  harborMaintenanceFee?: number | null;
  destinationCharges?: number | null;
}

export interface LiquidacionTotalesInput {
  incoterm?: string | null;
  flete?: number | null;
  otrosGastos?: number | null;
  valorPoliza?: number | null;
}

export interface LiquidacionDraftLine {
  codSecLineFilm: number;
  tipoPelicula: string;
  precio: number;
  kilosTotal?: number | null;
  kilosTotalUnit?: number | null;
  valueFOB?: number | null;
  valueTotal?: number | null;
  valueFreight?: number | null;
  valueFreightUnit?: number | null;
  valueSure?: number | null;
  valueSureUnit?: number | null;
  expensesOther?: number | null;
  expensesOtherUnit?: number | null;
  subTotal?: number | null;
  total?: number | null;
  totalUnidad?: number | null;
}

export interface LiquidacionDraft {
  numberPF: string;
  ordenVenta: string;
  ordenCompra: string;
  cliente: string;
  pais: string | null;
  esUSA: boolean;
  incoterm: string | null;
  incotermOrigen: 'oben' | 'usuario' | null;
  header: LiquidacionHeaderValues;
  headerOrigen: Partial<Record<keyof LiquidacionHeaderValues, OrigenValor>>;
  /** Origen del flete y los otros gastos (tabla de fletes, calculado, provisional o digitado). */
  totalesOrigen?: Partial<Record<'flete' | 'otrosGastos', OrigenValor>>;
  totales: LiquidacionTotalesInput;
  lines: LiquidacionDraftLine[];
  ajustes: string[];
  missing: string[];
  readyToSubmit: boolean;
  /** Aprobación de COMEX (obligatoria para enviar a Oben); null si la PF aún no está lista para aprobarse. */
  aprobacion?: { existe: boolean; vigente: boolean; por: string | null; en: string | null } | null;
  simulated: boolean;
  sinConfirmar: string[];
}

export interface LiquidacionSimulacion {
  dryRun: boolean;
  simulated?: boolean;
  sinConfirmar?: string[];
  numberPF: string;
  payloads?: { header: Record<string, unknown>; details: Record<string, unknown>[] };
}

// ── MIA — espejo de backend/src/modules/eva/eva.service.ts ──

export interface MiaTurno {
  rol: 'usuario' | 'mia';
  texto: string;
}

export interface MiaContexto {
  ruta?: string;
  ov?: number;
}

/** Botones que MIA deja en el chat: descargar un documento o ir a una pantalla. */
export type MiaAccion =
  | { tipo: 'descargar'; documento: string; ov: number; etiqueta: string }
  | { tipo: 'navegar'; ruta: string; etiqueta: string };

export interface MiaRespuesta {
  reply: string;
  action?: { type: string; data: unknown };
  acciones?: MiaAccion[];
}
