import { Injectable, Logger } from '@nestjs/common';

/**
 * SeedService legacy (fase pre-multitenant). Neutralizado a un stub.
 * La generación de datasets realistas por tenant vive ahora en Bloque 5
 * (dataset-generator) — este servicio existe solo para no romper el CLI
 * `npm run seed` mientras se completa la migración de todos los llamadores.
 */
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  async seed(): Promise<void> {
    this.logger.warn(
      'SeedService.seed() ha sido reemplazado por el generador multi-tenant. Use el nuevo dataset generator del Bloque 5.',
    );
  }
}
