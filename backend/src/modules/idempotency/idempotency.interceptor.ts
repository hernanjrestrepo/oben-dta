import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyStatus } from '../../entities/idempotency-record.entity';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { IDEMPOTENT_EVENT_KEY, IDEMPOTENT_TTL_KEY } from './idempotent.decorator';

interface IdempotentRequestBody {
  messageId?: string;
  from: string;
  subject: string;
  body: string;
  attachments?: Array<{ filename: string }>;
}

/**
 * Interceptor transversal (WO-018 Sprint 4): resuelve idempotencia ANTES de
 * dejar pasar la request al controlador. Aplica a cualquier endpoint
 * decorado con `@Idempotent(eventType)` — hoy `QuotesController.receiveEmail`
 * y `PurchaseOrdersController.receiveEmail`, sin lógica propia en ninguno de
 * los dos.
 *
 * - Ya `completed` → devuelve el resultado guardado, el controlador NUNCA se
 *   ejecuta (cero efectos secundarios duplicados: ni segunda cotización, ni
 *   segunda orden, ni segundo correo saliente).
 * - `processing` (duplicado concurrente real, en curso ahora mismo) → 409,
 *   tampoco ejecuta el controlador.
 * - No existe / expiró → reclama la clave y SOLO ENTONCES corre el
 *   controlador; marca completed/failed según el resultado.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly idempotency: IdempotencyService,
    private readonly ctx: TenantContext,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const eventType = this.reflector.get<string | undefined>(
      IDEMPOTENT_EVENT_KEY,
      context.getHandler(),
    );
    if (!eventType) return next.handle();

    const ttlMs = this.reflector.get<number>(IDEMPOTENT_TTL_KEY, context.getHandler());
    const request = context.switchToHttp().getRequest<{ body: IdempotentRequestBody }>();
    const body = request.body;
    const key = this.idempotency.computeKey({
      messageId: body.messageId,
      from: body.from,
      subject: body.subject,
      body: body.body,
      attachmentNames: (body.attachments ?? []).map((a) => a.filename),
    });
    const tenantId = this.ctx.tenantId;

    return from(this.handle(tenantId, eventType, key, ttlMs, next));
  }

  private async handle(
    tenantId: string,
    eventType: string,
    key: string,
    ttlMs: number,
    next: CallHandler,
  ): Promise<unknown> {
    const claim = await this.idempotency.claim(tenantId, eventType, key, ttlMs);

    if (!claim.claimed) {
      if (claim.existingStatus === IdempotencyStatus.COMPLETED) {
        return claim.existingResult;
      }
      if (claim.existingStatus === IdempotencyStatus.PROCESSING) {
        throw new ConflictException(
          `Correo duplicado (clave de idempotencia "${key}") ya está siendo procesado.`,
        );
      }
      // FAILED: el TTL seguía vigente cuando falló — no se reintenta
      // automáticamente en este sprint (WO-018 no lo pide); se reporta como
      // conflicto para no silenciar el fallo previo.
      throw new ConflictException(
        `Correo duplicado (clave de idempotencia "${key}") falló en un procesamiento previo: ${claim.existingResult ?? 'sin detalle'}`,
      );
    }

    try {
      const result = await firstValueFrom(next.handle());
      await this.idempotency.markCompleted(tenantId, key, result);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.idempotency.markFailed(tenantId, key, message);
      throw e;
    }
  }
}
