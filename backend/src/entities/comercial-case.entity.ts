import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

/**
 * Estado de un caso comercial (una orden de compra de un cliente), reunión
 * Comercial 2026-09-23: OC recibida → Proforma "sin cubicar" en OBEN MAS →
 * cubicada por Planeación → enviada al cliente → aprobada (OV retenida) →
 * cartera libera (OV activa) → cerrada al despacharse. Finales: rechazada,
 * anulada.
 */
export const CASO_ESTADOS = [
  'oc_recibida',
  'sin_cubicar',
  'cubicada',
  'enviada_cliente',
  'retenida',
  'activa',
  'cerrada',
  'rechazada',
  'anulada',
] as const;
export type CasoEstado = (typeof CASO_ESTADOS)[number];
export const CASO_ESTADOS_ABIERTOS: readonly CasoEstado[] = ['oc_recibida', 'sin_cubicar', 'cubicada', 'enviada_cliente', 'retenida', 'activa'];

export interface CasoLinea {
  n: number;
  /** El texto de la línea tal como lo escribió el cliente. */
  textoCliente: string;
  /** Cómo nombra el cliente el material (ej. "BOPP 1"). */
  codigoCliente: string | null;
  /** Referencia de Oben — SOLO desde la tabla de equivalencias o una corrección humana, nunca adivinada. */
  codigoOben: string | null;
  equivalenciaId: string | null;
  cantidad: number | null;
  unidad: string | null;
  kilos: number | null;
  anchoMm: number | null;
  espesorMicras: number | null;
  precioUnitario: number | null;
  moneda: string | null;
  /** Conversiones aplicadas (ej. "2.204,6 lb → 1.000 kg"). */
  conversiones: string[];
  faltantes: string[];
}

export interface CasoDestino {
  direccion: string;
  ciudad: string | null;
  pais: string;
  direccionId: string | null;
  fuente: 'maestro' | 'orden_compra' | 'manual';
}

export type AccionPendienteTipo = 'crear_proforma' | 'aprobar' | 'rechazar' | 'modificar' | 'activar';
export interface AccionPendiente {
  tipo: AccionPendienteTipo;
  detalle: string;
  creadaEn: string;
  lineas?: CasoLinea[];
}

export interface CasoSeguimiento {
  tipo: 'firma' | 'cartera' | null;
  enviados: number;
  proximoEn: string | null;
  ultimoEn: string | null;
}

export interface CasoEvento {
  fecha: string;
  tipo: string;
  detalle: string;
  actor?: string | null;
}

export type CasoFechas = Partial<
  Record<
    | 'ocRecibida'
    | 'proformaCreada'
    | 'cubicada'
    | 'enviadaCliente'
    | 'aprobadaCliente'
    | 'retenida'
    | 'carteraLiberada'
    | 'activa'
    | 'rechazada'
    | 'anulada'
    | 'cerrada',
    string
  >
>;

@Entity('comercial_cases')
export class ComercialCase extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', default: 'oc_recibida' })
  estado: CasoEstado;

  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId: string | null;

  @Column({ type: 'varchar', nullable: true })
  cliente: string | null;

  @Column({ name: 'codigo_cliente_oben', type: 'varchar', nullable: true })
  codigoClienteOben: string | null;

  @Column({ name: 'cliente_final', type: 'varchar', nullable: true })
  clienteFinal: string | null;

  /** Quien envió la orden de compra (compras del cliente): recibe la Proforma. */
  @Column({ name: 'contacto_email' })
  contactoEmail: string;

  @Column({ name: 'comercial_email', type: 'varchar', nullable: true })
  comercialEmail: string | null;

  @Column({ name: 'oc_numero', type: 'varchar', nullable: true })
  ocNumero: string | null;

  @Index()
  @Column({ name: 'oc_message_id', type: 'varchar', nullable: true })
  ocMessageId: string | null;

  @Column({ name: 'oc_asunto', type: 'varchar', default: '' })
  ocAsunto: string;

  @Index()
  @Column({ name: 'oc_recibida_en', type: 'timestamptz' })
  ocRecibidaEn: Date;

  @Column({ name: 'oc_texto', type: 'text', default: '' })
  ocTexto: string;

  @Column({ name: 'oc_adjuntos', type: 'jsonb', default: () => "'[]'" })
  ocAdjuntos: Array<{ filename: string; contentType: string | null; bytes: number; leido: boolean }>;

  @Column({ name: 'extraido_por', type: 'varchar', default: 'reglas' })
  extraidoPor: 'reglas' | 'ia';

  @Column({ type: 'varchar', nullable: true })
  tipo: 'nacional' | 'exportacion' | null;

  @Column({ type: 'varchar', nullable: true })
  pais: string | null;

  @Column({ type: 'jsonb', nullable: true })
  destino: CasoDestino | null;

  @Column({ name: 'fecha_requerida', type: 'varchar', nullable: true })
  fechaRequerida: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  lineas: CasoLinea[];

  /** Lo que impide avanzar sin una persona: nunca se rellena. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  missing: string[];

  /** Avisos que una persona debe revisar (dominio no autorizado, respuesta ambigua, envío bloqueado…). */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  atencion: string[];

  @Column({ type: 'boolean', default: false })
  simulated: boolean;

  @Column({ name: 'simulated_items', type: 'jsonb', default: () => "'[]'" })
  simulatedItems: string[];

  /** Freno de mano (modo supervisado): la escritura en OBEN MAS espera la confirmación de una persona. */
  @Column({ name: 'accion_pendiente', type: 'jsonb', nullable: true })
  accionPendiente: AccionPendiente | null;

  @Index()
  @Column({ name: 'number_pf', type: 'varchar', nullable: true })
  numberPF: string | null;

  @Column({ name: 'number_order_sales', type: 'int', nullable: true })
  numberOrderSales: number | null;

  /** Message-ID de los correos que enviamos al cliente: así se reconoce su respuesta en el mismo hilo. */
  @Column({ name: 'hilo_message_ids', type: 'jsonb', default: () => "'[]'" })
  hiloMessageIds: string[];

  @Column({ type: 'jsonb', default: () => "'{\"tipo\":null,\"enviados\":0,\"proximoEn\":null,\"ultimoEn\":null}'" })
  seguimiento: CasoSeguimiento;

  @Index()
  @Column({ name: 'next_check_at', type: 'timestamptz', nullable: true })
  nextCheckAt: Date | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  fechas: CasoFechas;

  @Column({ name: 'entrega_comprometida', type: 'varchar', nullable: true })
  entregaComprometida: string | null;

  @Column({ name: 'entrega_historial', type: 'jsonb', default: () => "'[]'" })
  entregaHistorial: Array<{ fecha: string; anterior: string | null; nueva: string | null }>;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  eventos: CasoEvento[];

  /** Proforma firmada/aprobada que devolvió el cliente (adjunto de su respuesta). */
  @Column({ name: 'proforma_firmada', type: 'bytea', nullable: true, select: false })
  proformaFirmada: Buffer | null;

  @Column({ name: 'proforma_firmada_nombre', type: 'varchar', nullable: true })
  proformaFirmadaNombre: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
