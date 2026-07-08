import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../../../entities/tenant.entity';
import { MockScenario } from '../../../entities/mock-scenario.entity';
import { AdapterRegistry } from './adapter-registry';
import { IntegrationHubService } from './integration-hub.service';
import { IntegrationHubController } from './integration-hub.controller';
import { PersistentScenarioProvider } from './persistent-scenario-provider';
import { MockScenariosService } from './mock-scenarios.service';
import { MockScenariosController } from './mock-scenarios.controller';
import { SCENARIO_PROVIDER, ScenarioProvider } from './scenario.types';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
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

/**
 * IntegrationHub: infraestructura común de todos los adapters + panel de escenarios.
 * Global porque EVA, workflows y demás consumen el hub sin importar el módulo.
 *
 * SCENARIO_PROVIDER se registra con la implementación persistente (BD por tenant).
 * Los tests unitarios de adapters usan StaticScenarioProvider directamente.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, MockScenario]),
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('JWT_SECRET') ||
          'default-jwt-secret-change-in-production',
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [IntegrationHubController, MockScenariosController],
  providers: [
    PersistentScenarioProvider,
    {
      provide: SCENARIO_PROVIDER,
      useExisting: PersistentScenarioProvider,
    },
    {
      provide: ScenarioProvider,
      useExisting: PersistentScenarioProvider,
    },
    OracleMockAdapter,
    ObenMockAdapter,
    CubeIQMockAdapter,
    DianMockAdapter,
    EFrancoMockAdapter,
    ShippingMockAdapter,
    EmailMockAdapter,
    WhatsAppMockAdapter,
    NetSuiteMockAdapter,
    VetaMockAdapter,
    ArmstrongMockAdapter,
    AdapterRegistry,
    IntegrationHubService,
    MockScenariosService,
    JwtAuthGuard,
  ],
  exports: [
    IntegrationHubService,
    AdapterRegistry,
    MockScenariosService,
    SCENARIO_PROVIDER,
  ],
})
export class IntegrationHubModule {}
