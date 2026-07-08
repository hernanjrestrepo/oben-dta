import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MockScenario } from '../../../entities/mock-scenario.entity';
import { TenantContext } from '../../../common/tenant/tenant-context.service';
import { INTEGRATION_SYSTEMS, IntegrationSystem } from './adapter.types';
import { PersistentScenarioProvider } from './persistent-scenario-provider';
import { ScenarioBehavior } from './scenario.types';

export interface UpsertScenarioDto {
  system: IntegrationSystem;
  operation: string;
  behavior: ScenarioBehavior;
  latencyMs?: number;
  jitterMs?: number;
  httpStatus?: number;
  errorCode?: string;
  errorMessage?: string;
  errorRatio?: number;
  metadata?: Record<string, unknown>;
  enabled?: boolean;
}

const VALID_BEHAVIORS: ScenarioBehavior[] = [
  'happy_path',
  'latency',
  'timeout',
  'network_error',
  'auth_error',
  'authz_error',
  'business_error',
  'invalid_response',
  'not_found',
  'rate_limited',
];

@Injectable()
export class MockScenariosService {
  constructor(
    @InjectRepository(MockScenario)
    private readonly repo: Repository<MockScenario>,
    private readonly ctx: TenantContext,
    private readonly cache: PersistentScenarioProvider,
  ) {}

  async list(): Promise<MockScenario[]> {
    return this.repo.find({
      where: { tenantId: this.ctx.tenantId },
      order: { system: 'ASC', operation: 'ASC' },
    });
  }

  async listBySystem(system: IntegrationSystem): Promise<MockScenario[]> {
    return this.repo.find({
      where: { tenantId: this.ctx.tenantId, system },
      order: { operation: 'ASC' },
    });
  }

  async get(
    system: IntegrationSystem,
    operation: string,
  ): Promise<MockScenario | null> {
    return this.repo.findOne({
      where: { tenantId: this.ctx.tenantId, system, operation },
    });
  }

  async upsert(
    dto: UpsertScenarioDto,
    actorUserId?: string,
  ): Promise<MockScenario> {
    this.assertValidSystem(dto.system);
    this.assertValidBehavior(dto.behavior);
    if (
      dto.errorRatio !== undefined &&
      (dto.errorRatio < 0 || dto.errorRatio > 1)
    ) {
      throw new BadRequestException('errorRatio debe estar entre 0 y 1');
    }
    const tenantId = this.ctx.tenantId;
    let row = await this.repo.findOne({
      where: { tenantId, system: dto.system, operation: dto.operation },
    });
    if (!row) {
      row = this.repo.create({
        tenantId,
        system: dto.system,
        operation: dto.operation,
        behavior: dto.behavior,
        latencyMs: dto.latencyMs ?? null,
        jitterMs: dto.jitterMs ?? null,
        httpStatus: dto.httpStatus ?? null,
        errorCode: dto.errorCode ?? null,
        errorMessage: dto.errorMessage ?? null,
        errorRatio: dto.errorRatio ?? null,
        metadata: dto.metadata ?? {},
        enabled: dto.enabled ?? true,
        setBy: actorUserId ?? null,
      });
    } else {
      row.behavior = dto.behavior;
      row.latencyMs = dto.latencyMs ?? null;
      row.jitterMs = dto.jitterMs ?? null;
      row.httpStatus = dto.httpStatus ?? null;
      row.errorCode = dto.errorCode ?? null;
      row.errorMessage = dto.errorMessage ?? null;
      row.errorRatio = dto.errorRatio ?? null;
      row.metadata = dto.metadata ?? row.metadata;
      row.enabled = dto.enabled ?? true;
      row.setBy = actorUserId ?? row.setBy;
    }
    const saved = await this.repo.save(row);
    this.cache.invalidate(tenantId, dto.system, dto.operation);
    return saved;
  }

  async remove(system: IntegrationSystem, operation: string): Promise<void> {
    this.assertValidSystem(system);
    const tenantId = this.ctx.tenantId;
    const result = await this.repo.delete({ tenantId, system, operation });
    if (result.affected === 0) {
      throw new NotFoundException(
        `Escenario para ${system}.${operation} no existe`,
      );
    }
    this.cache.invalidate(tenantId, system, operation);
  }

  async resetAll(): Promise<{ deleted: number }> {
    const tenantId = this.ctx.tenantId;
    const result = await this.repo.delete({ tenantId });
    this.cache.invalidate(tenantId);
    return { deleted: result.affected ?? 0 };
  }

  behaviors(): ScenarioBehavior[] {
    return [...VALID_BEHAVIORS];
  }

  private assertValidSystem(system: string): void {
    if (!INTEGRATION_SYSTEMS.includes(system as IntegrationSystem)) {
      throw new BadRequestException(
        `system inválido. Válidos: ${INTEGRATION_SYSTEMS.join(', ')}`,
      );
    }
  }

  private assertValidBehavior(behavior: string): void {
    if (!VALID_BEHAVIORS.includes(behavior as ScenarioBehavior)) {
      throw new BadRequestException(
        `behavior inválido. Válidos: ${VALID_BEHAVIORS.join(', ')}`,
      );
    }
  }
}
