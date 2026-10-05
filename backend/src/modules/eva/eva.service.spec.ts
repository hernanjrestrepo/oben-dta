import { EvaService, MIA_MODEL } from './eva.service';
import type { MiaLlm, MiaMensaje, MiaRespuestaLlm } from './mia-llm';

const T = 'tenant-1';

function respuesta(content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>, stop: string): MiaRespuestaLlm {
  return {
    texto: content.filter((c) => c.type === 'text').map((c) => c.text).join(' '),
    llamadas: content.filter((c) => c.type === 'tool_use').map((c) => ({ id: c.id!, name: c.name!, input: c.input })),
    cortada: stop === 'max_tokens',
  };
}
const usar = (name: string, input: unknown, id = `tu_${name}`) => ({ type: 'tool_use', id, name, input });
const texto = (text: string) => ({ type: 'text', text });

function build(
  opts: {
    respuestas?: MiaRespuestaLlm[];
    permitir?: (p: string) => boolean;
    sinCliente?: boolean;
  } = {},
) {
  const pedidos: MiaMensaje[][] = [];
  const cola = [...(opts.respuestas ?? [])];
  const client: MiaLlm & { completar: jest.Mock } = {
    completar: jest.fn(async (mensajes: MiaMensaje[]) => {
      pedidos.push(structuredClone(mensajes));
      const r = cola.shift();
      if (!r) throw new Error('sin más respuestas');
      return r;
    }),
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

describe('EvaService (MIA sobre la nube de Ollama)', () => {
  it('sin ANTHROPIC_API_KEY responde que no está configurada (y audita)', async () => {
    const { svc, audit } = build({ sinCliente: true });
    const r = await svc.chat('hola');
    expect(r.reply).toMatch(/OLLAMA_API_KEY/);
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
    expect(MIA_MODEL).toBe('gemma4:31b');
    expect(pedidos[0][0].role).toBe('system');
    const resultado = pedidos[1].at(-1) as { role: string; tool_call_id: string; content: string };
    expect(resultado.role).toBe('tool');
    expect(resultado.tool_call_id).toBe('tu_ultimas_facturas');
    expect(resultado.content).not.toMatch(/^ERROR/);
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
    const resultado = pedidos[1].at(-1) as { content: string };
    expect(resultado.content).toMatch(/^ERROR/);
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
    expect(client.completar).toHaveBeenCalledTimes(1);
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
    const resultado = pedidos[1].at(-1) as { content: string };
    expect(resultado.content).toMatch(/^ERROR/);
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
    const msgs = pedidos[0];
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(msgs[1].content).toBe('última factura');
    expect(msgs[3].content).toContain('¿y la anterior?');
    expect(msgs[3].content).toContain('OV cargada en pantalla: 11187');
  });

  it('si Anthropic falla responde un mensaje claro en vez de romperse', async () => {
    const { svc } = build({ respuestas: [] });
    const r = await svc.chat('hola');
    expect(r.reply).toMatch(/no pudo conectarse/);
  });
});
