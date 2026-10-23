import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

/**
 * - enviada: la llamada salió y aún no vuelve (si queda así, el proceso se cayó en medio: verificar en OBEN MAS).
 * - facturada / ya_facturada / en_espera / rechazada / revisar: lo que se concluyó de la respuesta de Oben.
 */
export type ResultadoLlamadaFactura = 'enviada' | 'facturada' | 'ya_facturada' | 'en_espera' | 'rechazada' | 'revisar';

/** Una llamada a la API de factura de Oben (23-oct): el registro con el que se cruzan las facturas con Oben. */
@Entity('facturas_llamadas')
export class FacturaLlamada extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'solicitud_id', type: 'uuid' })
  solicitudId: string;

  @Column({ name: 'number_pf', type: 'varchar', length: 20 })
  numberPF: string;

  @Column({ name: 'numero_distribucion', type: 'varchar', length: 20, default: '' })
  numeroDistribucion: string;

  /** Qué la disparó: cierre de la orden, cuadro del día, correo "Facturar Parcial", clic de una persona… */
  @Column({ type: 'varchar', length: 40 })
  disparo: string;

  @Column({ type: 'varchar', length: 20, default: 'enviada' })
  resultado: ResultadoLlamadaFactura;

  /** Respuesta de Oben tal cual (o el error de red). */
  @Column({ type: 'text', nullable: true })
  respuesta: string | null;

  @Column({ name: 'duracion_ms', type: 'int', nullable: true })
  duracionMs: number | null;

  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'terminada_at', type: 'timestamptz', nullable: true })
  terminadaAt: Date | null;
}
