import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../../entities/tenant.entity';
import {
  IntegrationAdapter,
  IntegrationSystem,
  INTEGRATION_SYSTEMS,
} from './adapter.types';
import { ScenarioProvider } from './scenario.types';
import { OracleMockAdapter } from './adapters/oracle.mock';
import { ObenMockAdapter } from './adapters/oben.mock';
import { CubeIQMockAdapter } from './adapters/cubeiq.mock';
import { DianMockAdapter } from './adapters/dian.mock';
import { EFrancoMockAdapter } from './adapters/efranco.mock';
import { ShippingMockAdapter } from './adapters/shipping.mock';
import { EmailMockAdapter } from './adapters/email.mock';
import { WhatsAppMockAdapter } from './adapters/whatsapp.mock';
import { NetSuiteMockAdapter } from './adapters/netsuite.mock';
import { VetaMockAdapter } from './adapters/veta.mock';
import { ArmstrongMockAdapter } from './adapters/armstrong.mock';
import {
  GenericHttpRealAdapter,
  GenericHttpAdapterConfig,
} from './adapters/generic-http.real';
import {
  EmailSmtpRealAdapter,
  EmailSmtpAdapterConfig,
} from './adapters/email-smtp.real';
import { ObenCostOrderMockAdapter } from './adapters/oben-cost-order.mock';
import {
  ObenCostOrderRealAdapter,
  ObenCostOrderAdapterConfig,
} from './adapters/oben-cost-order.real';

/**
 * Resuelve qué adapter devolver para (tenant, system) combinando:
 *   1. `tenant.integrationConfig.<system>.mode`  → 'real' | 'mock' (default 'mock')
 *   2. Si mode=real: lee credenciales + routes de tenant.integrationConfig.<system>
 *   3. Si mode=mock: devuelve la instancia mock ya inyectada
 *
 * De esta forma el resto del sistema (workflows, controllers) NUNCA
 * conoce el modo — solo pide un adapter por system y llama execute().
 */
@Injectable()
export class AdapterRegistry {
  private readonly logger = new Logger(AdapterRegistry.name);

  private readonly mocks: Record<IntegrationSystem, IntegrationAdapter>;

  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    oracle: OracleMockAdapter,
    oben: ObenMockAdapter,
    cubeiq: CubeIQMockAdapter,
    dian: DianMockAdapter,
    efranco: EFrancoMockAdapter,
    shipping: ShippingMockAdapter,
    email: EmailMockAdapter,
    whatsapp: WhatsAppMockAdapter,
    netsuite: NetSuiteMockAdapter,
    veta: VetaMockAdapter,
    armstrong: ArmstrongMockAdapter,
    obenCostOrder: ObenCostOrderMockAdapter,
    // Referencia al provider por si algún real futuro decide reutilizar escenarios
    // en modo hibrido (por ejemplo, degradación controlada).
    private readonly _scenarios?: ScenarioProvider,
  ) {
    this.mocks = {
      oracle,
      oben,
      cubeiq,
      dian,
      efranco,
      shipping,
      email,
      whatsapp,
      netsuite,
      veta,
      armstrong,
      obenCostOrder,
    };
  }

  listSystems(): readonly IntegrationSystem[] {
    return INTEGRATION_SYSTEMS;
  }

  async resolve(
    tenantId: string,
    system: IntegrationSystem,
  ): Promise<IntegrationAdapter> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    const cfg = ((tenant?.integrationConfig as
      | Record<string, Record<string, unknown>>
      | undefined) ?? {})[system];
    const mode = (cfg?.mode as string | undefined) ?? 'mock';

    if (mode === 'real') {
      return this.buildRealAdapter(system, cfg ?? {});
    }
    return this.mocks[system];
  }

  private buildRealAdapter(
    system: IntegrationSystem,
    cfg: Record<string, unknown>,
  ): IntegrationAdapter {
    // 'email' es el único sistema del hub que no habla HTTP/REST — usa SMTP,
    // así que se resuelve a un adapter dedicado en vez del genérico HTTP
    // (WO-018 Sprint 6). `cfg.smtp` viene de tenant.integrationConfig.email.smtp.
    if (system === 'email') {
      const smtp = (cfg.smtp as Record<string, unknown>) ?? {};
      const smtpConfig: EmailSmtpAdapterConfig = {
        host: smtp.host as string | undefined,
        port: (smtp.port as number | undefined) ?? 587,
        secure: (smtp.secure as boolean | undefined) ?? false,
        user: smtp.user as string | undefined,
        pass: smtp.pass as string | undefined,
        fromAddress: smtp.fromAddress as string | undefined,
      };
      return new EmailSmtpRealAdapter(smtpConfig);
    }

    // 'obenCostOrder' tampoco encaja en el genérico: autenticación por header
    // propio (`Authtoken`) y parámetros de negocio también como headers, no
    // query/body. Confirmado en vivo contra api.obengroup.co (2026-08-18).
    if (system === 'obenCostOrder') {
      const costOrderConfig: ObenCostOrderAdapterConfig = {
        baseUrl: cfg.baseUrl as string | undefined,
        authToken: cfg.authToken as string | undefined,
      };
      return new ObenCostOrderRealAdapter(costOrderConfig);
    }

    const httpConfig: GenericHttpAdapterConfig = {
      system,
      baseUrl: (cfg.baseUrl as string) ?? undefined,
      authScheme:
        (cfg.authScheme as GenericHttpAdapterConfig['authScheme']) ?? 'none',
      apiKey: (cfg.apiKey as string) ?? undefined,
      apiKeyHeader: (cfg.apiKeyHeader as string) ?? 'x-api-key',
      bearerToken: (cfg.bearerToken as string) ?? undefined,
      basicUser: (cfg.basicUser as string) ?? undefined,
      basicPass: (cfg.basicPass as string) ?? undefined,
      timeoutMs: (cfg.timeoutMs as number) ?? 15000,
      routes: (cfg.routes as GenericHttpAdapterConfig['routes']) ?? {},
    };
    return new GenericHttpRealAdapter(httpConfig);
  }
}
