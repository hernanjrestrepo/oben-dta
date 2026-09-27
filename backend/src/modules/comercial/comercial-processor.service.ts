import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { CASO_ESTADOS_ABIERTOS, ComercialCase } from '../../entities/comercial-case.entity';
import { ComercialFlujoService } from './comercial-flujo.service';

const POLL_INTERVAL_MS = 60_000;
/** Tope por ciclo: las APIs de Oben no soportan concurrencia y cada caso hace 1–3 consultas. */
const MAX_CASOS_POR_CICLO = 50;

/**
 * Motor de fondo del flujo Comercial: cada minuto toma los casos abiertos
 * cuyo `next_check_at` venció y los hace avanzar (¿ya cubicaron?, ¿toca
 * recordatorio?, ¿cartera liberó?, ¿cambió la fecha de entrega?). El estado
 * vive en la tabla — sobrevive reinicios — y un ciclo nunca se solapa con
 * el siguiente (mismo aprendizaje que la cola de Lista de Empaque).
 */
@Injectable()
export class ComercialProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ComercialProcessorService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @InjectRepository(ComercialCase) private readonly casos: Repository<ComercialCase>,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.procesarVencidos().catch((err) => this.logger.error(`Error en el ciclo Comercial: ${(err as Error).message}`));
    }, POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** @param tenantId si se indica, solo ese tenant (botón "procesar ahora" del simulador). */
  async procesarVencidos(tenantId?: string): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let procesados = 0;
    try {
      const vencidos = await this.casos.find({
        where: {
          ...(tenantId ? { tenantId } : {}),
          estado: In([...CASO_ESTADOS_ABIERTOS]),
          nextCheckAt: LessThanOrEqual(new Date()),
        },
        order: { nextCheckAt: 'ASC' },
        take: MAX_CASOS_POR_CICLO,
      });
      for (const caso of vencidos) {
        try {
          const contextId = ContextIdFactory.create();
          const ctx = await this.moduleRef.resolve(TenantContext, contextId, { strict: false });
          ctx.setContext(caso.tenantId, null, false);
          const flujo = await this.moduleRef.resolve(ComercialFlujoService, contextId, { strict: false });
          // Se relee: el ciclo puede durar y alguien pudo confirmar/anular el caso entretanto.
          const actual = await flujo.obtener(caso.id);
          if (!actual.nextCheckAt || actual.nextCheckAt.getTime() > Date.now()) continue;
          await flujo.procesar(actual);
          procesados++;
        } catch (err) {
          this.logger.error(`Caso comercial ${caso.id}: ${(err as Error).message}`);
          // Sin esto, un caso con error se reintentaría cada minuto para siempre.
          await this.casos.update(caso.id, { nextCheckAt: new Date(Date.now() + 15 * 60_000) });
        }
      }
    } finally {
      this.running = false;
    }
    return procesados;
  }
}
