import { explicacionHtml, explicarFalla } from './factura-explicaciones';
import { FacturasParcialesService } from './facturas-parciales.service';

const ERROR_400 = 'HTTP 400: {"isSuccessful":"False","code":"400","message":"No se pudo crear la factura de venta, validar los par\\u00E1metros suministrados o no son v\\u00E1lidos"}';

describe('explicarFalla (explicaciones claras, 20-oct)', () => {
  it('HTTP 400 "No se pudo crear la factura de venta": explica que Oben arma la factura y no dice qué dato falla, y muestra el patrón', () => {
    const e = explicarFalla('rechazada', ERROR_400, {
      numberPF: '11467',
      cliente: 'MINIPAK S.A.S.',
      ov: 11267,
      otrasConMismoError: ['11412', '11452', '11467', '11490'],
    });
    expect(e.titulo).toBe('Oben no aceptó crear la factura');
    expect(e.queOcurrio).toContain('proforma 11467');
    expect(e.queOcurrio).toContain('MINIPAK S.A.S.');
    expect(e.queOcurrio).toContain('No se creó ninguna factura');
    expect(e.queSignifica).toMatch(/lo arma el ERP de Oben/);
    expect(e.queSignifica).toMatch(/no dice cuál dato es/);
    expect(e.queSignifica).toMatch(/otras 3 proformas \(11412, 11452, 11490\)/); // sin repetir la propia
    expect(e.queSeHace.join(' ')).toMatch(/José/);
    expect(e.queSeHace.join(' ')).toMatch(/No conviene reintentar/);
    expect(e.reintentable).toBe(true);
    expect(e.tecnico).toContain('HTTP 400');
  });

  it('timeout de 90 s → "no sabemos si Oben creó la factura": puede existir, no se repite a ciegas, qué hacer', () => {
    const e = explicarFalla('revisar', 'This operation was aborted', { numberPF: '11423', numeroDistribucion: '', ov: 11243 });
    expect(e.titulo).toBe('No sabemos si Oben creó la factura');
    expect(e.queOcurrio).toMatch(/no respondió dentro de 90 segundos/);
    expect(e.queOcurrio).toMatch(/volvimos a preguntar una vez/);
    expect(e.queSignifica).toMatch(/PUEDE existir/);
    expect(e.queSignifica).toMatch(/duplicar/);
    expect(e.queSeHace[0]).toMatch(/Buscar la proforma 11423 en OBEN MAS/);
  });

  it('respuesta genérica "An error has occurred" también es "no sabemos", pero dice que Oben contestó sin explicación', () => {
    const e = explicarFalla('revisar', 'Respuesta de Oben sin confirmación de éxito ({"message":"An error has occurred."}).', { numberPF: '11250' });
    expect(e.titulo).toBe('No sabemos si Oben creó la factura');
    expect(e.queOcurrio).toMatch(/error genérico, sin explicación/);
  });

  it('"Aprobación pendiente" no es rechazo: se reintenta sola cada 15 minutos', () => {
    const e = explicarFalla('en_espera', 'Oben rechazó la operación (Code 500): La proforma: PF-11374, se encuentra en estado: Aprobación pendiente', { numberPF: '11374' });
    expect(e.titulo).toBe('La proforma aún espera aprobación en Oben');
    expect(e.queSignifica).toMatch(/No es un rechazo/);
    expect(e.queSeHace[0]).toMatch(/cada 15 minutos/);
  });

  it('"ya ha sido procesado en otra instancia": probablemente ya existe; verificar antes de repetir', () => {
    const e = explicarFalla('revisar', 'Orden de venta #CLOP_9891_OV ya ha sido procesado en otra instancia del navegador o por otro usuario', { numberPF: '11503' });
    expect(e.titulo).toBe('Oben dice que ya procesó esta solicitud');
    expect(e.queSignifica).toMatch(/SÍ exista/);
    expect(e.reintentable).toBe(false);
  });

  it('exportación / país sin confirmar y suspensión tienen su propia explicación; lo desconocido no se esconde', () => {
    expect(explicarFalla('pendiente', 'La PF 11250 es de EXPORTACIÓN: por ahora solo se facturan pedidos nacionales (Colombia).', { numberPF: '11250' }).titulo).toMatch(/no es un pedido nacional/);
    expect(explicarFalla('pendiente', 'La facturación está suspendida hasta nueva orden.', { numberPF: '1' }).titulo).toBe('La facturación está suspendida');
    const raro = explicarFalla('rechazada', 'algo nunca visto', { numberPF: '9' });
    expect(raro.titulo).toBe('Oben no pudo crear la factura');
    expect(raro.tecnico).toBe('algo nunca visto');
  });

  it('el HTML trae las tres secciones y escapa el detalle técnico', () => {
    const html = explicacionHtml(explicarFalla('rechazada', '<b>raro</b> & más', { numberPF: '9' }));
    expect(html).toContain('<b>Qué pasó</b>');
    expect(html).toContain('<b>Qué significa</b>');
    expect(html).toContain('<b>Qué se hace</b>');
    expect(html).toContain('&lt;b&gt;raro&lt;/b&gt; &amp; más');
  });
});

describe('aviso de resultado: PDF de la factura y explicación', () => {
  function armar(opts: { pdf?: 'ok' | 'falla'; error?: string; estado?: string } = {}) {
    const fila: Record<string, unknown> = {
      id: 'f1', tenantId: 't1', numberPF: '11460', numeroDistribucion: '', origen: 'automatico', remitente: 'OV 11309', estado: opts.estado ?? 'facturada',
      error: opts.error ?? null, modo: 'real', respuesta: { Code: '200', message: '9155349', isSuccessful: true },
    };
    const repo = { findOne: jest.fn(async () => fila), find: jest.fn(async () => []), update: jest.fn(), save: jest.fn(), create: jest.fn((x) => x) };
    const hub = { call: jest.fn(async () => ({ ok: true, mode: 'real', data: { id: 'm1' } })) };
    const listas = { resolveRecipients: jest.fn(async () => ({ to: ['jorge@oben.com', 'camilo@oben.com'], cc: ['hernan@x.com'], bcc: [] })) };
    const audit = { log: jest.fn() };
    const facturacion = {
      generateDocument: jest.fn(async (ov: number) => {
        if (opts.pdf === 'falla') throw Object.assign(new Error('x'), { getResponse: () => ({ message: 'El documento de facturación no se puede generar todavía', missing: ['dirección de entrega'] }) });
        return { pdf: Buffer.from('%PDF-1.4 prueba'), avisos: ['CUFE simulado'], filename: `Factura_Borrador-OV${ov}.pdf` };
      }),
      ordenesDeProforma: jest.fn(async () => ({ numberPF: '11460', ordenesVenta: [11309], cliente: null, pais: null })),
    };
    const svc = new FacturasParcialesService(repo as never, { findOne: jest.fn() } as never, { tenantId: 't1', userId: 'u1' } as never, hub as never, audit as never, listas as never, undefined as never, facturacion as never);
    return { svc, hub, facturacion, audit };
  }
  const correo = (hub: { call: jest.Mock }) => hub.call.mock.calls.find((c) => c[1] === 'send')![2] as { to: string; cc?: string; subject: string; body: string; attachments?: Array<{ filename: string; content: string }> };

  it('factura creada: el correo lleva la factura en PDF adjunta y dice qué es', async () => {
    const { svc, hub, facturacion } = armar();
    const r = await svc.reenviarAviso('f1');
    expect(r.enviado).toBe(true);
    expect(facturacion.generateDocument).toHaveBeenCalledWith(11309, { parcial: false });
    const c = correo(hub);
    expect(c.subject).toBe('Factura creada en OBEN MAS — PF 11460');
    expect(c.attachments).toHaveLength(1);
    expect(c.attachments![0].filename).toBe('Factura-PF11460-OV11309.pdf');
    expect(Buffer.from(c.attachments![0].content, 'base64').toString()).toContain('%PDF');
    expect(c.body).toContain('Se adjunta la factura en PDF');
    expect(c.body).toContain('9155349');
    expect(c.body).toContain('CUFE simulado'); // nunca se esconde lo simulado
  });

  it('con "para" el aviso va SOLO a esa persona (reenvío directo)', async () => {
    const { svc, hub } = armar();
    await svc.reenviarAviso('f1', ['Hernan.Jose.Restrepo.M@outlook.com']);
    const c = correo(hub);
    expect(c.to).toBe('hernan.jose.restrepo.m@outlook.com');
    expect(c.cc).toBeUndefined();
  });

  it('si el PDF no se puede armar, el correo lo dice con el motivo y lo que falta (no sale sin explicar)', async () => {
    const { svc, hub } = armar({ pdf: 'falla' });
    await svc.reenviarAviso('f1');
    const c = correo(hub);
    expect(c.attachments).toBeUndefined();
    expect(c.body).toContain('No se pudo adjuntar el PDF de la factura');
    expect(c.body).toContain('dirección de entrega');
  });

  it('rechazada: sin PDF, con la explicación (qué pasó / qué significa / qué se hace)', async () => {
    const { svc, hub, facturacion } = armar({ estado: 'rechazada', error: ERROR_400 });
    await svc.reenviarAviso('f1');
    const c = correo(hub);
    expect(facturacion.generateDocument).not.toHaveBeenCalled();
    expect(c.subject).toBe('Factura RECHAZADA por Oben — PF 11460');
    expect(c.body).toContain('Oben no aceptó crear la factura');
    expect(c.body).toContain('Qué significa');
    expect(c.body).toContain('Qué se hace');
    expect(c.attachments).toBeUndefined();
  });

  it('reenviar el aviso no pide nada a Oben y deja rastro en la auditoría; una solicitud sin resultado no se avisa', async () => {
    const { svc, hub, audit } = armar();
    await svc.reenviarAviso('f1', ['a@b.co']);
    expect((hub.call.mock.calls as unknown as unknown[][]).every((c) => c[1] === 'send')).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'factura_aviso_reenviado' }));
    await expect(armar({ estado: 'pendiente' }).svc.reenviarAviso('f1')).rejects.toThrow(/todavía no hay resultado/);
    await expect(armar().svc.reenviarAviso('f1', ['no-es-correo'])).rejects.toThrow(/no son válidos/);
  });
});
