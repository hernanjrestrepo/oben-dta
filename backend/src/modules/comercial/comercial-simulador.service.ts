import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { Client } from '../../entities/client.entity';
import { CASO_ESTADOS_ABIERTOS, ComercialCase } from '../../entities/comercial-case.entity';
import { EquivalencesService } from '../equivalences/equivalences.service';
import { ComercialFlujoService } from './comercial-flujo.service';
import { ComercialIntakeService } from './comercial-intake.service';
import { ComercialProcessorService } from './comercial-processor.service';

/** Cliente de demostración: dominio .example (RFC 2606), nunca recibe ni envía correo real. */
export const CLIENTE_DEMO = {
  clientId: 'SIM-CLI-PILOTO',
  obenCode: 'SIM-CLI-01',
  name: 'CLIENTE SIMULADO — PILOTO',
  email: 'compras@cliente-simulado.example',
  authorizedDomains: ['cliente-simulado.example'],
  comercialEmail: 'comercial@oben-simulado.example',
};

/**
 * Equivalencias SIMULADAS (≈10, como las que Alejandra mandará para un
 * cliente): las referencias Oben llevan el prefijo SIM- para que nunca se
 * confundan con una real. Se reemplazan cargando su Excel en Equivalencias.
 */
export const EQUIVALENCIAS_DEMO: Array<[string, string]> = [
  ['BOPP 15', 'SIM-SC15TN'],
  ['BOPP 20', 'SIM-SC20TN'],
  ['BOPP 25 TN', 'SIM-SC25TN'],
  ['BOPP MATE 20', 'SIM-MT20'],
  ['BOPP PERLADO 30', 'SIM-PL30'],
  ['BOPP BLANCO 35', 'SIM-WH35'],
  ['POLIESTER TRANSPARENTE 12', 'SIM-ET12'],
  ['POLIESTER 15 G', 'SIM-ET12'],
  ['PET METALIZADO 12', 'SIM-MET12'],
  ['CPP 25', 'SIM-CPP25'],
];

export type ControlSimulador = 'cubicar' | 'liberar-cartera' | 'producir-no-despachar' | 'cambiar-entrega';
const OPERACION: Record<ControlSimulador, string> = {
  cubicar: 'sim.cubicar',
  'liberar-cartera': 'sim.liberarCartera',
  'producir-no-despachar': 'sim.producirNoDespachar',
  'cambiar-entrega': 'sim.cambiarEntrega',
};

/**
 * Herramientas de demostración/pruebas del flujo Comercial mientras Oben no
 * entrega sus APIs ni Alejandra sus datos. Solo funcionan con OBEN MAS
 * (`obenPlus`) en modo simulado: con el sistema real conectado se rechazan.
 */
@Injectable()
export class ComercialSimuladorService {
  constructor(
    private readonly hub: IntegrationHubService,
    private readonly ctx: TenantContext,
    private readonly audit: WorkflowAuditService,
    @InjectRepository(Client) private readonly clients: Repository<Client>,
    @InjectRepository(ComercialCase) private readonly casos: Repository<ComercialCase>,
    private readonly equivalences: EquivalencesService,
    private readonly intake: ComercialIntakeService,
    private readonly flujo: ComercialFlujoService,
    private readonly processor: ComercialProcessorService,
  ) {}

  /** Cliente piloto + 10 equivalencias, ambos SIMULADOS. Idempotente. */
  async cargarDatosDemo() {
    await this.soloSimulado();
    const tenantId = this.ctx.tenantId;
    const existente = await this.clients.findOne({ where: { tenantId, clientId: CLIENTE_DEMO.clientId } });
    // Siempre queda con los datos demo completos (aunque alguien lo haya editado o le falte algo).
    const client = await this.clients.save(
      this.clients.create({
        ...(existente ?? { usedCredit: 0, createdBy: this.ctx.userId ?? undefined }),
        ...CLIENTE_DEMO,
        tenantId,
        isActive: true,
        finalCustomerInSubject: false,
      }),
    );
    const existentes = new Set((await this.equivalences.findAll(client.id)).map((e) => e.clientCode));
    let creadas = 0;
    for (const [clientCode, obenCode] of EQUIVALENCIAS_DEMO) {
      if (existentes.has(clientCode)) continue;
      await this.equivalences.create({ clientId: client.id, clientCode, obenCode, description: 'SIMULADA — reemplazar con la tabla real de Alejandra' });
      creadas++;
    }
    await this.audit.log({
      workflowName: 'comercial',
      action: 'comercial_simulador_datos_demo',
      entityType: 'client',
      entityId: client.id,
      actorId: this.ctx.userId,
      outputData: { equivalenciasCreadas: creadas, simulated: true },
    });
    return { simulated: true, cliente: client, equivalenciasCreadas: creadas, equivalencias: EQUIVALENCIAS_DEMO.length };
  }

  /** Orden de compra de ejemplo (como la mandaría el cliente piloto), coherente con su maestro simulado. */
  async ocDemo(): Promise<{ from: string; subject: string; body: string }> {
    await this.soloSimulado();
    const maestro = await this.intake.maestro(CLIENTE_DEMO.obenCode);
    const direccion = 'error' in maestro ? null : maestro.direcciones[0];
    const n = (await this.casos.count({ where: { tenantId: this.ctx.tenantId, contactoEmail: CLIENTE_DEMO.email } })) + 1;
    const fecha = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const oc = `OC-SIM-${String(n).padStart(4, '0')}`;
    return {
      from: CLIENTE_DEMO.email,
      subject: `Orden de compra ${oc}`,
      body: [
        'Buenos días,',
        `Por favor ingresar la siguiente orden de compra ${oc} con alta prioridad.`,
        `Fecha requerida: ${fecha}`,
        direccion ? `Dirección de entrega: ${direccion.direccion} ${direccion.ciudad ?? ''}`.trim() : '',
        '- BOPP 15, 1.000 kg, ancho 425 mm, precio USD 2,85',
        '- Poliester 15 g, 2.204,6 lb, ancho 17", precio USD 3,10',
        '- BOPP MATE 20, 500 kg, ancho 60 cm',
        'Gracias,',
        'Compras — Cliente Simulado',
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  /** Mete una OC de ejemplo por el mismo camino que un correo real. */
  async recibirOcDemo(): Promise<ComercialCase> {
    const oc = await this.ocDemo();
    return this.flujo.recibirOc({ ...oc, messageId: `<oc-demo-${Date.now()}@cliente-simulado.example>` }, 'manual');
  }

  /** Lo que en la vida real hacen Planeación, cartera o producción en OBEN MAS. */
  async control(numberPF: string, control: ControlSimulador, fecha?: string) {
    await this.soloSimulado();
    const op = OPERACION[control];
    if (!op) throw new BadRequestException(`Control desconocido. Válidos: ${Object.keys(OPERACION).join(', ')}`);
    const res = await this.hub.call('obenPlus', op, { numberPF, ...(fecha ? { fecha } : {}) }, { maxAttempts: 1, timeoutMs: 30_000 });
    if (!res.ok) throw new BadRequestException(res.error ?? 'El simulador rechazó la operación');
    return res.data;
  }

  /** Procesa ya los casos abiertos del tenant (sin esperar el ciclo de 1 minuto). */
  async procesarAhora() {
    await this.soloSimulado();
    await this.casos.update(
      { tenantId: this.ctx.tenantId, estado: In([...CASO_ESTADOS_ABIERTOS]) },
      { nextCheckAt: new Date() },
    );
    return { procesados: await this.processor.procesarVencidos(this.ctx.tenantId) };
  }

  private async soloSimulado(): Promise<void> {
    const { mode } = await this.hub.capabilities('obenPlus');
    if (mode !== 'mock') {
      throw new BadRequestException('El simulador solo existe mientras OBEN MAS (obenPlus) está en modo simulado.');
    }
  }
}
