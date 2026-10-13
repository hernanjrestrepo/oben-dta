import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { FacturaParcial } from '../../entities/factura-parcial.entity';
import { FacturasParcialesService } from './facturas-parciales.service';

const INTERVALO_MS = 15 * 60_000;

/** Reintenta cada 15 min las facturas que Oben dejó en "Aprobación pendiente" (no son rechazos). */
@Injectable()
export class FacturasEsperaProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FacturasEsperaProcessor.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @InjectRepository(FacturaParcial) private readonly filas: Repository<FacturaParcial>,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.ciclo().catch((err) => this.logger.error(`Error reintentando facturas en espera: ${(err as Error).message}`));
    }, INTERVALO_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async ciclo(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const tenants = await this.filas.createQueryBuilder('f').select('DISTINCT f.tenant_id', 'tenantId').where("f.estado = 'en_espera'").getRawMany<{ tenantId: string }>();
      for (const { tenantId } of tenants) {
        const contextId = ContextIdFactory.create();
        const ctx = await this.moduleRef.resolve(TenantContext, contextId, { strict: false });
        ctx.setContext(tenantId, null, false);
        const svc = await this.moduleRef.resolve(FacturasParcialesService, contextId, { strict: false });
        await svc.reintentarEnEspera();
      }
    } finally {
      this.running = false;
    }
  }
}
