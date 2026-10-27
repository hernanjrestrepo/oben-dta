import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { Tenant } from '../../entities/tenant.entity';
import { CuadroDiarioService } from './cuadro-diario.service';

const INTERVALO_MS = 5 * 60_000;

/**
 * Carga SOLA el cuadro de facturación del día desde el Excel de SharePoint (27-oct: Comercial lo actualiza ahí y nadie
 * lo cargaba en Oben Xmart). Cada 5 min lee la hoja y la guarda como programación de hoy (reemplaza la de hoy, el plan
 * cambia durante el día). Solo PROGRAMA: no factura nada — facturar depende de la suspensión, de las guardas y del
 * cierre de cada orden. Solo para tenants con `settings.facturacion.soloProgramadas`.
 */
@Injectable()
export class CuadroDiarioProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CuadroDiarioProcessor.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.ciclo().catch((err) => this.logger.error(`Error cargando el cuadro del día: ${(err as Error).message}`));
    }, INTERVALO_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async ciclo(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const todos = await this.tenants.find();
      for (const t of todos) {
        const f = (t.settings?.facturacion ?? {}) as Record<string, unknown>;
        if (f.soloProgramadas !== true || f.cargaAutomaticaCuadro === false) continue;
        const contextId = ContextIdFactory.create();
        const ctx = await this.moduleRef.resolve(TenantContext, contextId, { strict: false });
        ctx.setContext(t.id, null, false);
        const svc = await this.moduleRef.resolve(CuadroDiarioService, contextId, { strict: false });
        try {
          const r = await svc.cargar();
          this.logger.log(`Cuadro de ${r.fecha} cargado desde SharePoint: ${r.cargadas} orden(es) para facturar (${r.excluidas} excluidas).`);
        } catch (err) {
          this.logger.warn(`Cuadro del día no cargado: ${(err as Error).message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
