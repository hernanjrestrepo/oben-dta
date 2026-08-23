import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { createHash } from 'crypto';
import {
  IdempotencyRecord,
  IdempotencyStatus,
} from '../../entities/idempotency-record.entity';
import { ClaimResult, IdempotencyKeyInput } from './idempotency.types';

/**
 * Servicio transversal de idempotencia (WO-018 Sprint 4) — reutilizable por
 * cualquier flujo disparado por un evento externo repetible (hoy
 * Cotizaciones y Órdenes de Compra; mañana COMEX/Navieras sin cambiar esta
 * clase). Ningún flujo implementa su propia lógica de deduplicación; todos
 * llaman `computeKey()` + `claim()`/`markCompleted()`/`markFailed()` aquí.
 *
 * Algoritmo de generación de clave (documentado, no implícito):
 *   1. Si el correo trae Message-ID real → `mid:<messageId>` tal cual.
 *   2. Si no → `sha256:<hash>` de la concatenación, en este orden exacto,
 *      de: remitente (trim+lowercase) + "|" + asunto (trim+lowercase) + "|"
 *      + cuerpo normalizado (espacios colapsados a uno solo, trim,
 *      lowercase) + "|" + nombres de adjuntos (trim+lowercase, ordenados
 *      alfabéticamente, unidos con ",").
 *   La normalización existe para que un mismo correo reenviado con
 *   diferencias triviales de espaciado/mayúsculas (frecuente si pasa por
 *   distintos clientes de correo) siga produciendo la misma clave.
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @InjectRepository(IdempotencyRecord)
    private readonly repo: Repository<IdempotencyRecord>,
  ) {}

  computeKey(input: IdempotencyKeyInput): string {
    if (input.messageId && input.messageId.trim()) {
      return `mid:${input.messageId.trim()}`;
    }
    const normalizedBody = input.body.replace(/\s+/g, ' ').trim().toLowerCase();
    const attachments = (input.attachmentNames ?? [])
      .map((a) => a.trim().toLowerCase())
      .sort()
      .join(',');
    const raw = [
      input.from.trim().toLowerCase(),
      input.subject.trim().toLowerCase(),
      normalizedBody,
      attachments,
    ].join('|');
    return `sha256:${createHash('sha256').update(raw).digest('hex')}`;
  }

  /**
   * Reclama atómicamente `(tenantId, key)`. La atomicidad la da el índice
   * único de la tabla vía `INSERT ... ON CONFLICT DO NOTHING`: si dos
   * llamadas concurrentes reclaman la misma clave, solo una ve
   * `claimed: true` — la otra recibe `claimed: false` sin haber ejecutado
   * absolutamente nada del flujo. Esto es lo que hace que la idempotencia se
   * resuelva ANTES de ejecutar el flujo, no como una limpieza posterior.
   */
  async claim<T = unknown>(
    tenantId: string,
    eventType: string,
    key: string,
    ttlMs: number,
  ): Promise<ClaimResult<T>> {
    await this.reapExpired(tenantId, key);
    const expiresAt = new Date(Date.now() + ttlMs);

    const insertResult = await this.repo
      .createQueryBuilder()
      .insert()
      .into(IdempotencyRecord)
      .values({
        tenantId,
        key,
        eventType,
        status: IdempotencyStatus.PROCESSING,
        expiresAt,
      })
      .orIgnore()
      .execute();

    // OJO: `identifiers` SIEMPRE trae una entrada por fila de entrada, incluso
    // cuando `ON CONFLICT DO NOTHING` descarta el insert — en ese caso esa
    // entrada es `null`, no ausente. `identifiers.length > 0` es SIEMPRE
    // verdadero para un insert de una fila; hay que revisar `raw` (lo que
    // Postgres realmente devolvió vía RETURNING), que sí queda vacío cuando
    // el conflicto descartó la fila.
    if (insertResult.raw.length > 0) {
      return { claimed: true };
    }

    const existing = await this.repo.findOne({ where: { tenantId, key } });
    if (!existing) {
      // Ventana rarísima: alguien reclamó y expiró/borró justo entre el
      // INSERT ignorado y este SELECT. Un solo reintento resuelve.
      return this.claim<T>(tenantId, eventType, key, ttlMs);
    }
    return {
      claimed: false,
      existingStatus: existing.status,
      existingResult: existing.result as T,
    };
  }

  async markCompleted(
    tenantId: string,
    key: string,
    result: unknown,
  ): Promise<void> {
    await this.repo.update(
      { tenantId, key },
      { status: IdempotencyStatus.COMPLETED, result: result as object },
    );
  }

  async markFailed(tenantId: string, key: string, error: string): Promise<void> {
    await this.repo.update(
      { tenantId, key },
      { status: IdempotencyStatus.FAILED, error },
    );
  }

  private async reapExpired(tenantId: string, key: string): Promise<void> {
    await this.repo.delete({ tenantId, key, expiresAt: LessThan(new Date()) });
  }
}
