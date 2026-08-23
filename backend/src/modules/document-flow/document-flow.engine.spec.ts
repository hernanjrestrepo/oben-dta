import { DocumentFlowEngine } from './document-flow.engine';
import {
  DocumentFlowRule,
  DocumentFlowRuleStatus,
} from '../../entities/document-flow-rule.entity';
import { DocumentSourceRegistry } from './document-source.registry';
import { ActionExecutorRegistry } from './action-executor.registry';
import { ValidatorRegistry } from './validator.registry';
import { ResolvedDocument } from './document-source.types';
import { ValidationResult } from './validator.types';

function makeContext() {
  return { tenantId: 't1', userId: 'u1', metadata: {} };
}

function makeRule(overrides: Partial<DocumentFlowRule> = {}): DocumentFlowRule {
  return {
    id: 'rule-1',
    tenantId: 't1',
    name: 'Regla de prueba',
    description: null,
    triggerEvent: 'PRODUCTION_ORDER_CLOSED',
    requiredDocuments: [
      {
        key: 'lista_empaque_unificada',
        label: 'Lista de Empaque Unificada',
        source: 'manual_upload',
        required: true,
      },
    ],
    recipients: [{ label: 'COMEX', to: ['comex@oben.test'] }],
    actions: [{ type: 'send_email', config: { subjectTemplate: 'Pedido' } }],
    integrations: [],
    validations: [],
    priority: 0,
    status: DocumentFlowRuleStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as DocumentFlowRule;
}

function makeEngine(opts: {
  rulesFound: DocumentFlowRule[];
  resolvedDoc: ResolvedDocument;
  actionResult?: { type: string; status: 'executed' | 'skipped' | 'failed' };
  validationResult?: ValidationResult;
}) {
  const repo = {
    find: jest.fn().mockResolvedValue(opts.rulesFound),
  };
  const source = { type: 'manual_upload', resolve: jest.fn().mockResolvedValue(opts.resolvedDoc) };
  const sources = new DocumentSourceRegistry(
    { type: 'generated', resolve: jest.fn() } as never,
    source as never,
    { type: 'oracle', resolve: jest.fn() } as never,
    { type: 'external_attachment', resolve: jest.fn() } as never,
  );
  const executeMock = jest
    .fn()
    .mockResolvedValue(opts.actionResult ?? { type: 'send_email', status: 'executed' });
  const actionRegistry = new ActionExecutorRegistry({
    type: 'send_email',
    execute: executeMock,
  } as never);
  const validatorRegistry = new ValidatorRegistry();
  const validateMock = jest
    .fn()
    .mockResolvedValue(opts.validationResult ?? { type: 'always_pass', passed: true });
  validatorRegistry.register('always_pass', { type: 'always_pass', validate: validateMock });
  const audit = { log: jest.fn().mockResolvedValue(undefined) };

  const engine = new DocumentFlowEngine(
    repo as never,
    sources,
    actionRegistry,
    validatorRegistry,
    audit as never,
  );
  return { engine, repo, audit, executeMock, validateMock };
}

describe('DocumentFlowEngine', () => {
  it('sin reglas activas para el evento → rules vacío, no ejecuta nada', async () => {
    const { engine, audit } = makeEngine({
      rulesFound: [],
      resolvedDoc: { key: 'x', state: 'ready' },
    });
    const result = await engine.handle('PRODUCTION_ORDER_CLOSED', makeContext());
    expect(result.rules).toHaveLength(0);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('documento requerido "ready" → ejecuta acciones y status completed', async () => {
    const { engine, executeMock, audit } = makeEngine({
      rulesFound: [makeRule()],
      resolvedDoc: {
        key: 'lista_empaque_unificada',
        state: 'ready',
        filename: 'lista.xls',
        mimeType: 'application/vnd.ms-excel',
        content: Buffer.from('data'),
      },
    });
    const result = await engine.handle('PRODUCTION_ORDER_CLOSED', makeContext());
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].status).toBe('completed');
    expect(result.rules[0].missingRequired).toHaveLength(0);
    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it('documento requerido "pending" → status partial, NO ejecuta acciones ni validaciones', async () => {
    const { engine, executeMock, validateMock } = makeEngine({
      rulesFound: [makeRule({ validations: [{ type: 'always_pass' }] })],
      resolvedDoc: {
        key: 'lista_empaque_unificada',
        state: 'pending',
        message: 'Pendiente de carga manual',
      },
    });
    const result = await engine.handle('PRODUCTION_ORDER_CLOSED', makeContext());
    expect(result.rules[0].status).toBe('partial');
    expect(result.rules[0].missingRequired).toEqual(['lista_empaque_unificada']);
    expect(validateMock).not.toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('regla sin acciones configuradas → status skipped aunque los documentos estén listos', async () => {
    const { engine } = makeEngine({
      rulesFound: [makeRule({ actions: [] })],
      resolvedDoc: { key: 'lista_empaque_unificada', state: 'ready', content: Buffer.from('x') },
    });
    const result = await engine.handle('PRODUCTION_ORDER_CLOSED', makeContext());
    expect(result.rules[0].status).toBe('skipped');
  });

  it('validación configurada y aprobada → ejecuta acciones (status completed)', async () => {
    const { engine, executeMock, validateMock } = makeEngine({
      rulesFound: [makeRule({ validations: [{ type: 'always_pass' }] })],
      resolvedDoc: { key: 'lista_empaque_unificada', state: 'ready', content: Buffer.from('x') },
      validationResult: { type: 'always_pass', passed: true },
    });
    const result = await engine.handle('PRODUCTION_ORDER_CLOSED', makeContext());
    expect(validateMock).toHaveBeenCalledTimes(1);
    expect(result.rules[0].validationsPassed).toBe(true);
    expect(result.rules[0].status).toBe('completed');
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('validación configurada y fallida → status validation_failed, NO ejecuta acciones', async () => {
    const { engine, executeMock } = makeEngine({
      rulesFound: [makeRule({ validations: [{ type: 'always_pass' }] })],
      resolvedDoc: { key: 'lista_empaque_unificada', state: 'ready', content: Buffer.from('x') },
      validationResult: { type: 'always_pass', passed: false, message: 'cupo insuficiente' },
    });
    const result = await engine.handle('PRODUCTION_ORDER_CLOSED', makeContext());
    expect(result.rules[0].status).toBe('validation_failed');
    expect(result.rules[0].failedValidations).toEqual(['always_pass']);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('validador no registrado → se reporta como fallido, no como excepción', async () => {
    const { engine } = makeEngine({
      rulesFound: [
        makeRule({ validations: [{ type: 'no_existe' as never }] }),
      ],
      resolvedDoc: { key: 'lista_empaque_unificada', state: 'ready', content: Buffer.from('x') },
    });
    const result = await engine.handle('PRODUCTION_ORDER_CLOSED', makeContext());
    expect(result.rules[0].status).toBe('validation_failed');
    expect(result.rules[0].validations[0].message).toMatch(/no registrado/);
  });

  // Regresión de seguridad (RC1 Sprint 5): una DocumentFlowRule con un
  // `source` inexistente (dato jsonb malicioso o corrupto, no verificable en
  // compilación) causaba una excepción sin capturar → HTTP 500. Debe fallar
  // controlado: `unavailable`, la regla en `partial`, sin tirar abajo el request.
  it('DocumentSource no registrado (regla maliciosa/corrupta) → falla controlado, NUNCA lanza', async () => {
    const repo = {
      find: jest.fn().mockResolvedValue([
        makeRule({
          requiredDocuments: [
            { key: 'x', label: 'x', source: 'evil_fake_source' as never, required: true },
          ],
        }),
      ]),
    };
    const realSources = new DocumentSourceRegistry(
      { type: 'generated', resolve: jest.fn() } as never,
      { type: 'manual_upload', resolve: jest.fn() } as never,
      { type: 'oracle', resolve: jest.fn() } as never,
      { type: 'external_attachment', resolve: jest.fn() } as never,
    );
    const actionRegistry = new ActionExecutorRegistry({ type: 'send_email', execute: jest.fn() } as never);
    const validatorRegistry = new ValidatorRegistry();
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const engine = new DocumentFlowEngine(repo as never, realSources, actionRegistry, validatorRegistry, audit as never);

    const result = await engine.handle('PRODUCTION_ORDER_CLOSED', makeContext());

    expect(result.rules[0].status).toBe('partial');
    expect(result.rules[0].missingRequired).toEqual(['x']);
    expect(result.rules[0].documents[0].state).toBe('unavailable');
    expect(result.rules[0].documents[0].message).toMatch(/evil_fake_source.*no registrado/);
    expect(audit.log).toHaveBeenCalledTimes(1); // queda auditado, no se pierde el rastro
  });
});
