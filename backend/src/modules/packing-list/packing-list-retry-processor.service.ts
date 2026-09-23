import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ModuleRef, ContextIdFactory } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { PackingListPendingRetry } from '../../entities/packing-list-pending-retry.entity';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { ObenReportsService } from '../oben-reports/oben-reports.service';
import { DistributionListsService } from '../distribution-lists/distribution-lists.service';
import { PackingListAutomationService } from './packing-list-automation.service';
import { PACKING_LIST_RETRY_INTERVAL_MS, PACKING_LIST_RETRY_MAX_ATTEMPTS } from './packing-list-retry.constants';

const POLL_INTERVAL_MS = 60_000;

/**
 * Procesa en segundo plano `packing_list_pending_retries` (ver
 * PackingListAutomationService.handleOvApproved) — corre aparte del ciclo de
 * correo del conector IMAP a propósito: una orden puede tardar hasta 50
 * minutos en resolverse (5 intentos, uno cada 10 minutos) antes de escalar, y
 * meter esa espera dentro del manejo del correo real reintroduciría el mismo
 * patrón que causó el bug de correos duplicados del 2026-09-11 (procesamiento
 * largo bloqueando el conector IMAP).
 *
 * Sobrevive un reinicio del proceso: el estado vive en la tabla, no en
 * memoria — un `setInterval` en memoria se habría perdido silenciosamente
 * ante cualquier redeploy a mitad de una espera de 50 minutos.
 */
@Injectable()
export class PackingListRetryProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PackingListRetryProcessorService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  /**
   * Guardado anti-solapamiento: un ciclo con varias órdenes tarda más que
   * POLL_INTERVAL_MS (~9 s por orden) y sin esto el siguiente tick tomaba las
   * mismas filas todavía 'pending' y reenviaba el mismo correo — incidente
   * 2026-09-23: 20 órdenes salieron hasta 4 veces cada una.
   */
  private running = false;

  constructor(
    @InjectRepository(PackingListPendingRetry)
    private readonly retries: Repository<PackingListPendingRetry>,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.processDueRetries().catch((err) =>
        this.logger.error(`Error procesando reintentos pendientes de Lista de Empaque: ${(err as Error).message}`),
      );
    }, POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async processDueRetries(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.retries.find({
        where: { status: 'pending', nextRetryAt: LessThanOrEqual(new Date()) },
      });
      for (const row of due) {
        try {
          await this.processOne(row);
        } catch (err) {
          this.logger.error(
            `Orden ${row.numberOrderSales}: error procesando su reintento (fila ${row.id}): ${(err as Error).message}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async processOne(row: PackingListPendingRetry): Promise<void> {
    const contextId = ContextIdFactory.create();
    const tenantCtx = await this.moduleRef.resolve(TenantContext, contextId, { strict: false });
    tenantCtx.setContext(row.tenantId, null, false);

    const automation = await this.moduleRef.resolve(PackingListAutomationService, contextId, { strict: false });
    const reports = await this.moduleRef.resolve(ObenReportsService, contextId, { strict: false });
    const documentPackage = await reports.buildDocumentPackage(row.numberOrderSales);

    // `stillMissing` cubre dos escenarios distintos con el mismo tratamiento
    // de reintento/escalamiento: el paquete sigue incompleto, O el paquete
    // quedó completo pero el envío del correo falló (ej. timeout de SMTP,
    // encontrado en vivo el 2026-09-17 con la OV 11040 — antes esto se
    // perdía en silencio sin reintentar ni escalar).
    let stillMissing = documentPackage.failed;

    if (documentPackage.failed.length === 0) {
      const distributionLists = await this.moduleRef.resolve(DistributionListsService, contextId, { strict: false });
      const resolved = await distributionLists.resolveRecipients('document', 'packing_list');
      const result = await automation.sendCompletePackage(row.numberOrderSales, documentPackage, resolved);
      if (!result.sendFailure) {
        await this.retries.update(row.id, { status: 'completed', lastMissing: null });
        this.logger.log(`Orden ${row.numberOrderSales}: se completó en el reintento ${row.attempts + 1} — correo enviado.`);
        return;
      }
      stillMissing = [result.sendFailure];
    }

    const attempts = row.attempts + 1;
    if (attempts >= PACKING_LIST_RETRY_MAX_ATTEMPTS) {
      await automation.sendEscalation(row.numberOrderSales, stillMissing);
      await this.retries.update(row.id, { status: 'escalated', attempts, lastMissing: stillMissing });
      this.logger.warn(
        `Orden ${row.numberOrderSales}: sigue incompleta tras ${attempts} intentos (${stillMissing.map((f) => f.key).join(', ')}) — escalada a José/Jorge.`,
      );
      return;
    }

    await this.retries.update(row.id, {
      attempts,
      nextRetryAt: new Date(Date.now() + PACKING_LIST_RETRY_INTERVAL_MS),
      lastMissing: stillMissing,
    });
    this.logger.warn(
      `Orden ${row.numberOrderSales}: intento ${attempts}/${PACKING_LIST_RETRY_MAX_ATTEMPTS} sigue incompleto (${stillMissing.map((f) => f.key).join(', ')}) — próximo intento en 10 minutos.`,
    );
  }
}
