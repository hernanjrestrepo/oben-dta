import type Anthropic from '@anthropic-ai/sdk';
import { EvaService, MIA_MODEL, MiaAnthropicClient } from './eva.service';

const T = 'tenant-1';

function respuesta(content: unknown[], stop_reason: string): Anthropic.Message {
  return {
    id: 'msg',
    type: 'message',
    role: 'assistant',
    model: MIA_MODEL,
    content,
    stop_reason,
    stop_sequence: null,
    usage: {},
  } as unknown as Anthropic.Message;
}
const usar = (name: string, input: unknown, id = `tu_${name}`) => ({
  type: 'tool_use',
  id,
  name,
  input,
});
const texto = (text: string) => ({ type: 'text', text });

function build(
  opts: {
    respuestas?: Anthropic.Message[];
    permitir?: (p: string) => boolean;
    sinCliente?: boolean;
  } = {},
) {
  const pedidos: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const cola = [...(opts.respuestas ?? [])];
  const client: MiaAnthropicClient = {
    messages: {
      create: jest.fn(
        async (params: Anthropic.MessageCreateParamsNonStreaming) => {
          pedidos.push(structuredClone(params));
          const r = cola.shift();
          if (!r) throw new Error('sin más respuestas');
          return r;
        },
      ),
    } as unknown as Anthropic['messages'],
  };
  const audit = {
    log: jest.fn(),
    listByAction: jest.fn(async (action: string) =>
      action === 'facturacion_enviada'
        ? [
            {
              createdAt: new Date('2026-10-01T15:30:00Z'),
              entityId: '11187',
              outputData: {
                ok: true,
                to: ['jose@oben.co'],
                cc: [],
                cufe: 'SIM-1',
                cufeSimulado: true,
                cliente: 'ACME',
              },
              reason: null,
            },
          ]
        : [],
    ),
  };
  const authz = {
    can: jest.fn(async ({ permission }: { permission: string }) => ({
      effect: (opts.permitir ?? (() => true))(permission) ? 'allow' : 'deny',
      reason: 'test',
    })),
  };
  const quotesService = {
    processIncomingEmail: jest.fn(async () => ({
      outcome: 'quoted',
      quote: { quoteNumber: 'COT-9', total: 1500000 },
    })),
  };
  const repo = { find: jest.fn(async () => []) };
  const ctx = {
    tenantId: T,
    tenantIdOrNull: T,
    userId: 'u1',
    isSuperAdmin: false,
  };
  const svc = new EvaService(
    repo as never,
    repo as never,
    repo as never,
    repo as never,
    repo as never,
    repo as never,
    repo as never,
    quotesService as never,
    {} as never,
    {} as never,
    {} as never,
    authz as never,
    ctx as never,
    audit as never,
    opts.sinCliente ? null : client,
  );
  return { svc, pedidos, client, audit, authz, quotesService };
}

describe('EvaService (MIA sobre Claude Haiku)', () => {
  it('sin ANTHROPIC_API_KEY responde que no está configurada (y audita)', async () => {
    const { svc, audit } = build({ sinCliente: true });
    const r = await svc.chat('hola');
    expect(r.reply).toMatch(/ANTHROPIC_API_KEY/);
    expect(audit.log).toHaveBeenCalled();
  });

  it('consulta la herramienta y responde con el texto final del modelo', async () => {
    const { svc, pedidos } = build({
      respuestas: [
        respuesta(
          [texto('Reviso.'), usar('ultimas_facturas', { limite: 5 })],
          'tool_use',
        ),
        respuesta([texto('La última factura fue la OV 11187.')], 'end_turn'),
      ],
    });
    const r = await svc.chat('¿cuándo fue la última factura?');
    expect(r.reply).toBe('La última factura fue la OV 11187.');
    expect(pedidos[0].model).toBe('claude-haiku-4-5');
    const resultado = (
      pedidos[1].messages.at(-1)!.content as Anthropic.ToolResultBlockParam[]
    )[0];
    expect(resultado.tool_use_id).toBe('tu_ultimas_facturas');
    expect(resultado.is_error).toBeUndefined();
    expect(String(resultado.content)).toContain('11187');
    expect(String(resultado.content)).toContain('jose@oben.co');
  });

  it('sin el permiso de la herramienta no consulta nada y se lo dice al modelo', async () => {
    const { svc, pedidos, audit } = build({
      permitir: (p) => p !== 'invoices.read',
      respuestas: [
        respuesta([usar('ultimas_facturas', {})], 'tool_use'),
        respuesta([texto('No tienes permiso.')], 'end_turn'),
      ],
    });
    await svc.chat('última factura');
    const resultado = (
      pedidos[1].messages.at(-1)!.content as Anthropic.ToolResultBlockParam[]
    )[0];
    expect(resultado.is_error).toBe(true);
    expect(String(resultado.content)).toContain('invoices.read');
    expect(audit.listByAction).not.toHaveBeenCalled();
  });

  it('generar_documento y abrir_pantalla dejan botones en el chat', async () => {
    const { svc } = build({
      respuestas: [
        respuesta(
          [
            usar('generar_documento', { documento: 'factura_pdf', ov: 11187 }),
            usar('abrir_pantalla', { ruta: '/facturacion', ov: 11187 }),
          ],
          'tool_use',
        ),
        respuesta([texto('Ahí tienes.')], 'end_turn'),
      ],
    });
    const r = await svc.chat('dame el pdf de la factura de la 11187');
    expect(r.acciones).toEqual([
      {
        tipo: 'descargar',
        documento: 'factura_pdf',
        ov: 11187,
        etiqueta: 'PDF de la factura (borrador) — OV 11187',
      },
      {
        tipo: 'navegar',
        ruta: '/facturacion?ov=11187',
        etiqueta: 'Abrir Liquidación y Facturación (OV 11187)',
      },
    ]);
  });

  it('crear_cotizacion responde desde el resultado real, sin volver a llamar al modelo', async () => {
    const { svc, client, quotesService } = build({
      respuestas: [
        respuesta(
          [
            usar('crear_cotizacion', {
              clienteEmail: 'compras@acme.com',
              descripcionPedido: '500 kg BOPP',
            }),
          ],
          'tool_use',
        ),
      ],
    });
    const r = await svc.chat('cotiza 500 kg de BOPP para compras@acme.com');
    expect(quotesService.processIncomingEmail).toHaveBeenCalledTimes(1);
    expect(client.messages.create).toHaveBeenCalledTimes(1);
    expect(r.reply).toContain('COT-9');
    expect(r.action?.type).toBe('quote_created');
  });

  it('un perfil de Consulta (sin quotes.create) no puede crear cotizaciones vía MIA', async () => {
    const { svc, pedidos, quotesService } = build({
      permitir: (p) => p !== 'quotes.create',
      respuestas: [
        respuesta(
          [
            usar('crear_cotizacion', {
              clienteEmail: 'compras@acme.com',
              descripcionPedido: '500 kg BOPP',
            }),
          ],
          'tool_use',
        ),
        respuesta([texto('No tienes permiso para crear cotizaciones.')], 'end_turn'),
      ],
    });
    const r = await svc.chat('cotiza 500 kg de BOPP para compras@acme.com');
    expect(quotesService.processIncomingEmail).not.toHaveBeenCalled();
    const resultado = (
      pedidos[1].messages.at(-1)!.content as Anthropic.ToolResultBlockParam[]
    )[0];
    expect(resultado.is_error).toBe(true);
    expect(String(resultado.content)).toContain('quotes.create');
    expect(r.action).toBeUndefined();
  });

  it('reenvía la conversación previa empezando por el usuario (omite el saludo de MIA)', async () => {
    const { svc, pedidos } = build({
      respuestas: [respuesta([texto('Sí.')], 'end_turn')],
    });
    await svc.chat(
      '¿y la anterior?',
      [
        { rol: 'mia', texto: 'Hola, soy MIA.' },
        { rol: 'usuario', texto: 'última factura' },
        { rol: 'mia', texto: 'Fue la OV 11187.' },
      ],
      { ruta: '/facturacion', ov: 11187 },
    );
    const msgs = pedidos[0].messages;
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(msgs[0].content).toBe('última factura');
    const ultimo = msgs[2].content as Anthropic.TextBlockParam[];
    expect(ultimo[0].text).toBe('¿y la anterior?');
    expect(ultimo[1].text).toContain('OV cargada en pantalla: 11187');
  });

  it('si Anthropic falla responde un mensaje claro en vez de romperse', async () => {
    const { svc } = build({ respuestas: [] });
    const r = await svc.chat('hola');
    expect(r.reply).toMatch(/no pudo conectarse/);
  });
});
