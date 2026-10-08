import { BadRequestException, ConflictException } from '@nestjs/common';
import { FacturasParcialesService, confirmaExito, parsearCorreoFacturaParcial } from './facturas-parciales.service';

// Correo REAL que llegó al buzón de pedidos el 2026-10-01 (ejemplo de José).
const ASUNTO = 'Proforma 10770 - Facturar Parcial';
const CUERPO = 'Numero de Proforma: 10770 - Numero de Distribucion: 11023';

describe('parsearCorreoFacturaParcial', () => {
  it('lee el correo real de Oben', () => {
    expect(parsearCorreoFacturaParcial(ASUNTO, CUERPO)).toEqual({ numberPF: '10770', numeroDistribucion: '11023' });
  });

  it('tolera reenvíos, tildes y saltos de línea', () => {
    expect(parsearCorreoFacturaParcial('RV: Proforma 10770 - Facturar Parcial', 'Número de Proforma: 10770\nNúmero de Distribución: 11023')).toEqual({
      numberPF: '10770',
      numeroDistribucion: '11023',
    });
  });

  it('otros correos no son facturas parciales', () => {
    expect(parsearCorreoFacturaParcial('OV 11187 aprobada en corte', CUERPO)).toBeNull();
  });

  it('asunto de parcial sin número de distribución, o con PF distinta en el cuerpo: error, nunca adivina', () => {
    expect(() => parsearCorreoFacturaParcial(ASUNTO, 'Numero de Proforma: 10770')).toThrow(BadRequestException);
    expect(() => parsearCorreoFacturaParcial(ASUNTO, 'Numero de Proforma: 99999 - Numero de Distribucion: 11023')).toThrow(/asunto dice Proforma 10770/);
  });
});

const crearCalls = (hub: { call: jest.Mock }) => hub.call.mock.calls.filter((c) => c[1] === 'factura.crear').length;

function build(opts: { hub?: { ok: boolean; error?: string; data?: unknown }; auto?: boolean; mercado?: string | null; pais?: string; suspendida?: boolean } = {}) {
  const filas: Array<Record<string, unknown>> = [];
  const coincide = (f: Record<string, unknown>, w: Record<string, unknown>) =>
    Object.entries(w).every(([k, v]) => {
      const val = v as { _type?: string; _value?: unknown[] };
      return val && val._type === 'in' ? (val._value ?? []).includes(f[k]) : f[k] === v;
    });
  const repo = {
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => filas.find((f) => coincide(f, where)) ?? null),
    find: jest.fn(async () => filas),
    create: jest.fn((x: Record<string, unknown>) => ({ ...x })),
    save: jest.fn(async (x: Record<string, unknown>) => {
      const f = { id: `id${filas.length + 1}`, ...x };
      filas.push(f);
      return f;
    }),
    update: jest.fn(async (where: Record<string, unknown>, cambios: Record<string, unknown>) => {
      const f = filas.find((x) => coincide(x, where));
      if (f) Object.assign(f, cambios);
      return { affected: f ? 1 : 0 };
    }),
  };
  const tenants = { findOne: jest.fn(async () => ({ settings: { facturacion: { parcialAutomatica: opts.auto === true, ...(opts.suspendida ? { suspendida: true } : {}) } } })) };
  const ctx = { tenantId: 't1', userId: 'u1' };
  const PFS = ['10770', '11250', '11381', '11242', '11249'];
  const hub = {
    call: jest.fn(async (_s: string, op: string, args: { procedure?: string }) =>
      op === 'query.run' && args?.procedure === 'spEmpaqueUnificada_Paradixe'
        ? { ok: true, mode: 'real', data: { Pais: opts.pais ?? 'COLOMBIA', Proforma: '11547' } }
        : op === 'query.run'
        ? { ok: true, mode: 'real', data: opts.mercado === null ? [] : PFS.map((p) => ({ NroProforma: p, Mercado: opts.mercado ?? 'NACIONAL' })) }
        : { mode: 'real', ...(opts.hub ?? { ok: true, data: { isSuccessful: true, Code: '200' } }) },
    ),
  };
  const audit = { log: jest.fn() };
  const listas = { resolveRecipients: jest.fn(async () => ({ to: ['jorge@oben.com', 'camilo@oben.com'], cc: ['hernan@x.com'], bcc: [] })) };
  const svc = new FacturasParcialesService(repo as never, tenants as never, ctx as never, hub as never, audit as never, listas as never);
  svc.esperaVerificacionMs = 0;
  return { svc, hub, filas, audit, listas };
}

describe('FacturasParcialesService (WO-023)', () => {
  const correo = { from: 'notif.app.co@obengroup.com', subject: ASUNTO, body: CUERPO, messageId: '<m1>' };

  it('el correo queda registrado y, por defecto, espera el clic (no factura solo)', async () => {
    const { svc, hub } = build();
    const f = await svc.registrarDesdeCorreo(correo);
    expect(f).toMatchObject({ numberPF: '10770', numeroDistribucion: '11023', estado: 'pendiente', origen: 'correo' });
    expect(crearCalls(hub)).toBe(0);
  });

  it('con parcialAutomatica factura al llegar el correo con NumberPF + NumberDistribucion', async () => {
    const { svc, hub } = build({ auto: true });
    const f = await svc.registrarDesdeCorreo(correo);
    expect(hub.call).toHaveBeenCalledWith('obenCostOrder', 'factura.crear', { numberPF: '10770', numberDistribucion: '11023' }, expect.anything());
    expect(f.estado).toBe('facturada');
  });

  it('un remitente fuera de @obengroup.com no puede pedir una factura', async () => {
    const { svc } = build();
    await expect(svc.registrarDesdeCorreo({ ...correo, from: 'alguien@gmail.com' })).rejects.toThrow(/obengroup\.com/);
  });

  it('el mismo parcial dos veces es una sola solicitud y una sola factura', async () => {
    const { svc, hub, filas } = build();
    const a = await svc.registrarDesdeCorreo(correo);
    const b = await svc.registrarManual('10770', '11023');
    expect(b.id).toBe(a.id);
    expect(filas).toHaveLength(1);
    await svc.facturar(a.id);
    await svc.facturar(a.id);
    expect(crearCalls(hub)).toBe(1);
  });

  it('Oben rechaza → "rechazada" (se puede reintentar); timeout → "revisar" (exige confirmar antes)', async () => {
    const r1 = build({ hub: { ok: false, error: 'Oben rechazó la operación (Code 500): EL ARTÍCULO 67511 NO SE ENCUENTRA' } });
    const f1 = await r1.svc.registrarManual('10770', '11023');
    expect((await r1.svc.facturar(f1.id)).estado).toBe('rechazada');

    const r3 = build({ hub: { ok: false, error: 'HTTP 400: {"isSuccessful":"False","code":"400","message":"No se pudo crear la factura de venta"}' } });
    const f3 = await r3.svc.registrarManual('10770', '11023');
    expect((await r3.svc.facturar(f3.id)).estado).toBe('rechazada'); // rechazo HTTP 4xx de Oben: reintentable

    const r2 = build({ hub: { ok: false, error: 'timeout after 60000ms' } });
    const f2 = await r2.svc.registrarManual('10770', '11023');
    expect((await r2.svc.facturar(f2.id)).estado).toBe('revisar');
    await expect(r2.svc.facturar(f2.id)).rejects.toBeInstanceOf(ConflictException);
    expect(crearCalls(r2.hub)).toBe(2); // 1 intento + 1 de verificación (sigue sin aclararse)
  });

  it('un HTTP exitoso SIN confirmación explícita de Oben NO es factura creada: queda en "revisar" y no se reintenta a ciegas', async () => {
    for (const data of [{ message: 'An error has occurred.' }, null, {}, 'OK']) {
      const { svc, hub } = build({ hub: { ok: true, data } });
      const f = await svc.registrarManual('11250', '11084');
      const r = await svc.facturar(f.id);
      expect(r.estado).toBe('revisar');
      expect(r.error).toMatch(/sin confirmación de éxito/);
      await expect(svc.facturar(f.id)).rejects.toBeInstanceOf(ConflictException);
      expect(crearCalls(hub)).toBe(2); // 1 intento + 1 de verificación; sigue sin confirmación → 'revisar'
    }
  });
});

describe('confirmaExito', () => {
  it.each([
    [{ isSuccessful: true }, true],
    [{ isSuccessful: 'True', code: '200' }, true],
    [{ Code: 200 }, true],
    [{ code: '200', message: 'OK' }, true],
    [{ isSuccessful: 'False', code: '400' }, false],
    [{ message: 'An error has occurred.' }, false],
    [[], false],
    [null, false],
    ['OK', false],
  ])('%j → %s', (data, esperado) => {
    expect(confirmaExito(data)).toBe(esperado);
  });

  it('SOLO NACIONALES: una PF de exportación no se factura (ni por clic ni automática) y queda el motivo', async () => {
    const { svc, hub, filas } = build({ mercado: 'EXPORTACION', auto: true });
    const f = await svc.registrarDesdeCorreo({ ...{ from: 'notif.app.co@obengroup.com', subject: 'Proforma 10770 - Facturar Parcial', body: 'Numero de Proforma: 10770 - Numero de Distribucion: 11023', messageId: '<x>' } }).catch((e) => e);
    // en modo automático la solicitud se registra y el intento de facturar falla con el motivo
    expect(String((f as Error).message ?? '')).toMatch(/EXPORTACIÓN/);
    expect(crearCalls(hub)).toBe(0);
    expect(String(filas[0].error)).toMatch(/solo se facturan pedidos nacionales/);
    expect(filas[0].estado).toBe('pendiente');
  });

  it('una PF que no aparece en el listado de Oben tampoco se factura (no se puede confirmar que sea nacional)', async () => {
    const { svc, hub } = build({ mercado: null });
    const f = await svc.registrarManual('11250', '11084');
    await expect(svc.facturar(f.id)).rejects.toThrow(/No se pudo confirmar/);
    expect(crearCalls(hub)).toBe(0);
  });
});

describe('Factura AUTOMÁTICA de pedidos nacionales (Hernán, 7-oct)', () => {
  it('OV de Colombia: factura la PF completa (NumberDistribucion vacío) sin que nadie lo pida', async () => {
    const { svc, hub, filas } = build({ pais: 'COLOMBIA' });
    const r = await svc.facturarOvNacional(11339);
    expect(r).toMatchObject({ estado: 'facturada', numberPF: '11547' });
    expect(hub.call).toHaveBeenCalledWith('obenCostOrder', 'factura.crear', { numberPF: '11547', numberDistribucion: '' }, expect.anything());
    expect(filas[0]).toMatchObject({ origen: 'automatico', numeroDistribucion: '' });
  });

  it('OV de exportación (México, EE. UU.): NO se factura', async () => {
    for (const pais of ['MEXICO', 'USA']) {
      const { svc, hub } = build({ pais });
      expect((await svc.facturarOvNacional(11014)).estado).toBe('omitida');
      expect(crearCalls(hub)).toBe(0);
    }
  });

  it('idempotente: la misma OV dos veces es una sola factura; y si la PF ya tiene solicitud (parcial) no se pide otra', async () => {
    const { svc, hub } = build();
    await svc.facturarOvNacional(11339);
    expect((await svc.facturarOvNacional(11339)).estado).toBe('omitida');
    expect(crearCalls(hub)).toBe(1);
    const b = build();
    await b.svc.registrarManual('11547', '11099'); // ya hay un parcial de esa PF
    expect((await b.svc.facturarOvNacional(11339)).estado).toBe('omitida');
    expect(crearCalls(b.hub)).toBe(0);
  });

  it('respuesta sin confirmación de Oben → "revisar", nunca "facturada"', async () => {
    const { svc } = build({ hub: { ok: true, data: { message: 'An error has occurred.' } } });
    expect((await svc.facturarOvNacional(11339)).estado).toBe('revisar');
  });

  it('Oben factura pero responde error genérico / se cuelga: el sistema VERIFICA solo; si Oben dice que ya estaba facturada → "facturada"', async () => {
    const { svc, hub } = build();
    let n = 0;
    hub.call.mockImplementation(async (_s: string, op: string, args: { procedure?: string }) => {
      if (op === 'query.run' && args?.procedure === 'spEmpaqueUnificada_Paradixe') return { ok: true, mode: 'real', data: { Pais: 'COLOMBIA', Proforma: '11547' } };
      if (op === 'query.run') return { ok: true, mode: 'real', data: [{ NroProforma: '11250', Mercado: 'NACIONAL' }] };
      n += 1;
      return n === 1 ? { ok: true, mode: 'real', data: { message: 'An error has occurred.' } } : { ok: false, mode: 'real', error: 'Oben rechazó la operación (Code 500): EL ARTÍCULO 5512 NO SE ENCUENTRA EN LA ORDEN DE VENTA _ ' };
    });
    const f = await svc.registrarManual('11250', '11084');
    const r = await svc.facturar(f.id);
    expect(r.estado).toBe('facturada');
    expect(crearCalls(hub)).toBe(2);
  });

  it('si la verificación tampoco aclara (otro timeout), queda en "revisar"', async () => {
    const { svc, hub } = build({ hub: { ok: false, error: 'This operation was aborted' } });
    const f = await svc.registrarManual('11250', '11084');
    expect((await svc.facturar(f.id)).estado).toBe('revisar');
    expect(crearCalls(hub)).toBe(2);
  });

  it('SUSPENDIDA: no se pide ninguna factura a Oben (ni el botón, ni el automático de pedidos nacionales)', async () => {
    const { svc, hub } = build({ suspendida: true });
    const f = await svc.registrarManual('11250', '11084');
    await expect(svc.facturar(f.id)).rejects.toThrow(/suspendida/);
    expect((await svc.facturarOvNacional(11339)).estado).toBe('omitida');
    expect(crearCalls(hub)).toBe(0);
  });

  it('AVISO por correo a la lista Facturación tras facturar (facturada, rechazada o por revisar) — antes el flujo automático no avisaba a nadie', async () => {
    const correos = (hub: { call: jest.Mock }) => hub.call.mock.calls.filter((c) => c[1] === 'send').map((c) => c[2] as { to: string; cc?: string; subject: string; body: string });
    const ok = build();
    await ok.svc.facturarOvNacional(11339);
    const a = correos(ok.hub);
    expect(a).toHaveLength(1);
    expect(a[0].to).toBe('jorge@oben.com');
    expect(a[0].cc).toBe('camilo@oben.com,hernan@x.com');
    expect(a[0].subject).toBe('Factura creada en OBEN MAS — PF 11547');
    expect(a[0].body).toContain('Pedido completo');
    expect(a[0].body).toContain('consúltalo en OBEN MAS');

    const mal = build({ hub: { ok: false, error: 'HTTP 400: {"isSuccessful":"False"}' } });
    await mal.svc.facturarOvNacional(11339);
    expect(correos(mal.hub)[0].subject).toBe('Factura RECHAZADA por Oben — PF 11547');

    const dudoso = build({ hub: { ok: false, error: 'This operation was aborted' } });
    await dudoso.svc.facturarOvNacional(11339);
    expect(correos(dudoso.hub)[0].subject).toBe('Factura por REVISAR en OBEN MAS — PF 11547');
  });

  it('si no hay destinatarios o el correo falla, la factura igual queda registrada (el aviso nunca la tumba)', async () => {
    const { svc, listas, filas } = build();
    listas.resolveRecipients.mockRejectedValueOnce(new Error('db caída'));
    const r = await svc.facturarOvNacional(11339);
    expect(r.estado).toBe('facturada');
    expect(filas[0].estado).toBe('facturada');
  });

  it('suspendida: no hay factura y tampoco correo', async () => {
    const { svc, hub } = build({ suspendida: true });
    await svc.facturarOvNacional(11339);
    expect(hub.call.mock.calls.filter((c) => c[1] === 'send')).toHaveLength(0);
  });
});
