import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';

/**
 * Ata la licencia a ESTA instalación física (esta base de datos), no solo a
 * un installationId generado al azar que cualquiera podría copiar junto con
 * el resto del código. `pg_control_system().system_identifier` es un valor
 * de 64 bits que Postgres asigna una única vez, en el momento de `initdb` —
 * permanece estable mientras se reutilice el mismo volumen de datos (redeploys,
 * reinicios, actualizaciones de código) y cambia solo si alguien copia el
 * código a un Postgres distinto (clonar el volumen de datos íntegro sí
 * preservaría el fingerprint, pero en ese caso es, por definición, la misma
 * instalación física de datos — el escenario que este control busca evitar es
 * "copiar el código/licencia a un servidor con una base de datos nueva").
 */
@Injectable()
export class InstallationFingerprintService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async current(): Promise<string> {
    const rows = await this.dataSource.query<
      Array<{ system_identifier: string }>
    >('SELECT system_identifier FROM pg_control_system()');
    const systemIdentifier = rows[0]?.system_identifier ?? 'unknown';
    return createHash('sha256')
      .update(systemIdentifier)
      .digest('hex')
      .slice(0, 32);
  }
}
