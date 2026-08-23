import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../entities/tenant.entity';
import { DocumentClassifier } from './document-classifier.types';
import { RulesClassifier } from './classifiers/rules-classifier';
import { OllamaClassifier } from './classifiers/ollama-classifier';

interface TenantClassifierSettings {
  provider?: 'rules' | 'ollama';
  ollamaHost?: string;
  ollamaModel?: string;
  timeoutMs?: number;
}

/**
 * Resuelve qué `DocumentClassifier` usar por tenant, leyendo
 * `tenant.settings.classifier` — mismo mecanismo de configuración por
 * tenant que `AdapterRegistry` usa para real/mock en el Integration Hub.
 * Default: `rules` (determinístico, sin dependencias externas).
 */
@Injectable()
export class ClassifierRegistry {
  constructor(
    private readonly rulesClassifier: RulesClassifier,
    @InjectRepository(Tenant)
    private readonly tenants: Repository<Tenant>,
  ) {}

  async resolve(tenantId: string): Promise<DocumentClassifier> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    const cfg =
      (tenant?.settings as { classifier?: TenantClassifierSettings } | undefined)
        ?.classifier ?? {};

    if (cfg.provider === 'ollama') {
      return new OllamaClassifier({
        host: cfg.ollamaHost ?? 'http://localhost:11434',
        model: cfg.ollamaModel ?? 'llama3.2:1b',
        timeoutMs: cfg.timeoutMs ?? 15000,
      });
    }
    return this.rulesClassifier;
  }
}
