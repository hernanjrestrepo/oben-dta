import { BadRequestException } from '@nestjs/common';
import { FormatosService, renderEnvio } from './formatos.service';

function build(guardado?: { clave: string; asunto: string; cuerpo: string }) {
  const filas = guardado ? [{ id: 'f1', tenantId: 't1', updatedAt: new Date(), ...guardado }] : [];
  const repo = {
    find: jest.fn(async () => filas),
    findOne: jest.fn(async ({ where }: { where: { clave: string } }) => filas.find((f) => f.clave === where.clave) ?? null),
    create: jest.fn((x: object) => ({ ...x })),
    save: jest.fn(async (x: object) => ({ id: 'f1', updatedAt: new Date(), ...x })),
    delete: jest.fn(),
  };
  const audit = { log: jest.fn() };
  const ctx = { tenantId: 't1', userId: 'u1' };
  return { svc: new FormatosService(repo as never, ctx as never, audit as never), repo, audit };
}

describe('FormatosService (WO-027)', () => {
  it('sin formato guardado usa exactamente el texto de siempre', async () => {
    const { svc } = build();
    const r = await svc.render('packing_list', { ov: 11187, sufijo: '', origen: 'con datos consultados en vivo al sistema real de Oben' }, false);
    expect(r.asunto).toBe('Lista de Empaque — Orden 11187');
    expect(r.cuerpoHtml).toBe(
      '<p>Adjuntos los documentos de la orden 11187, generados automáticamente al recibir la aprobación de corte, con datos consultados en vivo al sistema real de Oben.</p>',
    );
  });

  it('con formato guardado lo aplica, con párrafos y saltos de línea', async () => {
    const { svc } = build({ clave: 'packing_list', asunto: 'LE {ov} — {cliente}', cuerpo: 'Hola equipo,\n\nVa la orden {ov}.\nSaludos' });
    const r = await svc.render('packing_list', { ov: 11187, cliente: 'OBEN US, LLC' }, false);
    expect(r.asunto).toBe('LE 11187 — OBEN US, LLC');
    expect(r.cuerpoHtml).toBe('<p>Hola equipo,</p><p>Va la orden 11187.<br>Saludos</p>');
  });

  it('un correo simulado siempre lo dice, aunque el formato quite {origen}', async () => {
    const { svc } = build({ clave: 'packing_list', asunto: 'LE {ov}', cuerpo: 'Va la orden {ov}.' });
    const r = await svc.render('packing_list', { ov: 1, origen: 'con datos del SIMULADOR de Oben' }, true);
    expect(r.cuerpoHtml).toContain('SIMULADOR');
  });

  it('escapa HTML del formato y de las variables, y el asunto no admite saltos de línea', async () => {
    const { svc } = build({ clave: 'packing_list', asunto: 'LE {cliente}\r\nBcc: x@y.com', cuerpo: '<script>x</script> {cliente}' });
    const r = await svc.render('packing_list', { cliente: '<b>ACME</b>' }, false);
    expect(r.cuerpoHtml).not.toContain('<script>');
    expect(r.cuerpoHtml).toContain('&lt;b&gt;ACME&lt;/b&gt;');
    expect(r.asunto).not.toMatch(/[\r\n]/);
  });

  it('rechaza variables que no existen para ese documento', async () => {
    const { svc, repo } = build();
    await expect(svc.guardar('empaque_unificada', 'X {clienteX}', 'Y')).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('guardar deja auditoría con el antes y el después', async () => {
    const { svc, audit } = build();
    await svc.guardar('packing_list', 'LE {ov}', 'Va la orden {ov}.');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'formato_envio_actualizado', entityId: 'packing_list' }));
  });

  it('renderEnvio sin servicio (o si falla) cae al texto por defecto: nunca bloquea un envío', async () => {
    const r = await renderEnvio(undefined, 'empaque_unificada', { ov: 5, reporte: 'Lista de Empaque Unificada', origen: 'x' }, false);
    expect(r.asunto).toBe('Lista de Empaque Unificada — Orden 5');
    const roto = { render: jest.fn(async () => { throw new Error('db caída'); }) } as unknown as FormatosService;
    const r2 = await renderEnvio(roto, 'empaque_unificada', { ov: 5, reporte: 'Lista de Empaque Unificada', origen: 'x' }, false);
    expect(r2.asunto).toBe('Lista de Empaque Unificada — Orden 5');
  });
});
