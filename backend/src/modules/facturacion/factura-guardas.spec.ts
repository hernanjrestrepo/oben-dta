import { ConflictException } from '@nestjs/common';
import { FacturasParcialesService } from './facturas-parciales.service';

/**
 * Guardas del 23-oct contra facturas vacías y consecutivos dañados en Oben: cada llamada a la API de factura que
 * Oben rechaza a mitad de camino puede dejarle una factura vacía. Diagnóstico: la PF 11611 se pidió 12 veces en 2 h
 * (reintento cada 15 min de "Aprobación pendiente"), 8 llamadas sobre lo ya facturado, repeticiones "de verificación".
 */
type Fila = Record<string, unknown> & { id: string };
const AHORA = new Date('2026-10-23T15:00:00Z'); // 10:00 a. m. en Bogotá

const enOperador = (v: unknown) => v as { _type?: string; _value?: unknown };
function coincide(f: Record<string, unknown>, w: Record<string, unknown>) {
  return Object.entries(w).every(([k, v]) => {
    const op = enOperador(v);
    if (op && op._type === 'in') return (op._value as unknown[]).includes(f[k]);
    if (op && op._type === 'moreThanOrEqual') return new Date(f[k] as Date).getTime() >= new Date(op._value as Date).getTime();
    return f[k] === v;
  });
}
function memRepo(filas: Fila[], prefijo: string) {
  return {
    filas,
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => filas.find((f) => coincide(f, where)) ?? null),
    find: jest.fn(async (o: { where?: Record<string, unknown>; order?: Record<string, string>; take?: number } = {}) => {
      let r = filas.filter((f) => !o.where || coincide(f, o.where));
      if (o.order?.createdAt === 'DESC') r = [...r].sort((a, b) => new Date(b.createdAt as Date).getTime() - new Date(a.createdAt as Date).getTime());
      return o.take ? r.slice(0, o.take) : r;
    }),
    create: jest.fn((x: Record<string, unknown>) => ({ ...x })),
    save: jest.fn(async (x: Record<string, unknown>) => {
      const f = { id: `${prefijo}${filas.length + 1}`, createdAt: x.createdAt ?? AHORA, ...x } as Fila;
      filas.push(f);
      return f;
    }),
    update: jest.fn(async (where: Record<string, unknown>, cambios: Record<string, unknown>) => {
      const f = filas.find((x) => coincide(x, where));
      if (f) Object.assign(f, cambios);
      return { affected: f ? 1 : 0 };
    }),
  };
}

function build(o: { respuestas?: Array<{ ok: boolean; error?: string; data?: unknown }>; ajustes?: Record<string, unknown>; cuadro?: Array<Record<string, unknown>> } = {}) {
  const filas = memRepo([], 'sol');
  const llamadas = memRepo([], 'll');
  const programadas = memRepo((o.cuadro ?? []).map((c, i) => ({ id: `p${i}`, tenantId: 't1', fecha: '2026-10-23', ...c })) as Fila[], 'p');
  const tenant = { id: 't1', settings: { facturacion: { parcialAutomatica: true, ...(o.ajustes ?? {}) } } as Record<string, unknown> };
  const tenants = {
    findOne: jest.fn(async () => tenant),
    update: jest.fn(async (_w: unknown, c: { settings: Record<string, unknown> }) => void (tenant.settings = c.settings)),
  };
  let n = 0;
  const hub = {
    call: jest.fn(async (_s: string, op: string, args: { procedure?: string }) => {
      if (op === 'query.run' && args?.procedure === 'spEmpaqueUnificada_Paradixe') return { ok: true, mode: 'real', data: { Pais: 'COLOMBIA', Proforma: '11611', Cliente: 'ETICAP' } };
      if (op === 'query.run') return { ok: true, mode: 'real', data: ['11611', '11612', '11613', '11614', '11490'].map((p) => ({ NroProforma: p, Mercado: 'NACIONAL' })) };
      if (op === 'send') return { ok: true, mode: 'mock', data: {} };
      const r = o.respuestas?.[Math.min(n, (o.respuestas?.length ?? 1) - 1)] ?? { ok: true, data: { isSuccessful: true, Code: '200', message: '9200001' } };
      n += 1;
      return { mode: 'real', ...r };
    }),
  };
  const audit = { log: jest.fn(), listForEntity: jest.fn(async () => []) };
  const listas = { resolveRecipients: jest.fn(async () => ({ to: ['facturacion@oben.com'], cc: [], bcc: [] })) };
  const svc = new FacturasParcialesService(
    filas as never,
    tenants as never,
    { tenantId: 't1', userId: 'u1' } as never,
    hub as never,
    audit as never,
    listas as never,
    programadas as never,
    undefined,
    llamadas as never,
  );
  svc.reloj = () => AHORA;
  const crear = () => hub.call.mock.calls.filter((c) => c[1] === 'factura.crear').length;
  const correos = () => hub.call.mock.calls.filter((c) => c[1] === 'send').map((c) => (c[2] as { subject: string }).subject);
  return { svc, hub, llamadas, tenant, crear, correos };
}

const PENDIENTE = 'Oben rechazó la operación (Code 500): La proforma: PF-11611, se encuentra en estado: Aprobación pendiente';
const HTTP400 = 'HTTP 400: {"isSuccessful":"False","code":"400","message":"No se pudo crear la factura de venta"}';

describe('Guardas de facturación (23-oct): ninguna llamada de más a Oben', () => {
  it('cada llamada queda en el registro crudo: hora, PF, distribución, quién la disparó y qué respondió Oben', async () => {
    const { svc, llamadas } = build();
    const f = await svc.registrarManual('11611', '11300');
    expect((await svc.facturar(f.id)).estado).toBe('facturada');
    expect(llamadas.filas).toHaveLength(1);
    expect(llamadas.filas[0]).toMatchObject({ numberPF: '11611', numeroDistribucion: '11300', disparo: 'clic en pantalla', resultado: 'facturada' });
    expect(String(llamadas.filas[0].respuesta)).toContain('9200001');
  });

  it('"Aprobación pendiente": como máximo UNA llamada al día (antes: cada 15 min, la PF 11611 se pidió 12 veces)', async () => {
    const { svc, crear } = build({ respuestas: [{ ok: false, error: PENDIENTE }] });
    const f = await svc.registrarManual('11611', '11300');
    expect((await svc.facturar(f.id)).estado).toBe('en_espera');
    for (let i = 0; i < 8; i++) await svc.reintentarEnEspera(); // el procesador de fondo sigue pasando cada 15 min
    await expect(svc.facturar(f.id)).rejects.toThrow(/como máximo una vez al día/);
    expect(crear()).toBe(1);
  });

  it('una persona que verificó en OBEN MAS puede hacer UN último intento ese día, no más', async () => {
    const { svc, crear } = build({ respuestas: [{ ok: false, error: HTTP400 }] });
    const f = await svc.registrarManual('11611', '11300');
    expect((await svc.facturar(f.id)).estado).toBe('rechazada');
    await expect(svc.facturar(f.id)).rejects.toBeInstanceOf(ConflictException);
    expect((await svc.facturar(f.id, true)).estado).toBe('rechazada');
    await expect(svc.facturar(f.id, true)).rejects.toThrow(/como máximo una vez al día/);
    expect(crear()).toBe(2);
  });

  it('freno: 3 llamadas seguidas sin factura → la facturación se SUSPENDE sola y avisa a Facturación', async () => {
    const { svc, tenant, crear, correos } = build({ respuestas: [{ ok: false, error: HTTP400 }] });
    for (const pf of ['11611', '11612', '11613']) {
      const f = await svc.registrarManual(pf, '1');
      await svc.facturar(f.id);
    }
    expect((tenant.settings.facturacion as Record<string, unknown>).suspendida).toBe(true);
    expect((tenant.settings.facturacion as Record<string, unknown>).suspendidaPor).toBe('freno automático');
    expect(correos()).toContain('Facturación SUSPENDIDA automáticamente — Oben Xmart');
    const f4 = await svc.registrarManual('11614', '1');
    await expect(svc.facturar(f4.id)).rejects.toThrow(/suspendida/);
    expect(crear()).toBe(3);
  });

  it('una factura creada entre fallos rompe la racha: no frena', async () => {
    const { svc, tenant } = build({ respuestas: [{ ok: false, error: HTTP400 }, { ok: false, error: HTTP400 }, { ok: true, data: { isSuccessful: true, Code: '200', message: '1' } }, { ok: false, error: HTTP400 }] });
    for (const pf of ['11611', '11612', '11613', '11614']) await svc.facturar((await svc.registrarManual(pf, '1')).id);
    expect((tenant.settings.facturacion as Record<string, unknown>).suspendida).toBeUndefined();
  });

  it('cliente bloqueado (OBEN DISTRIBUIDORA, siempre da HTTP 400): no se llama a Oben', async () => {
    const { svc, crear } = build({ cuadro: [{ numberOrderSales: 11282, numberPF: '11490', tipo: 'completa', cliente: 'OBEN DISTRIBUIDORA COLOMBIA SAS' }] });
    const f = await svc.registrarManual('11490', '1');
    await expect(svc.facturar(f.id)).rejects.toThrow(/OBEN DISTRIBUIDORA COLOMBIA SAS está bloqueado/);
    expect(crear()).toBe(0);
  });

  it('la lista de clientes bloqueados se puede cambiar en los ajustes (vacía = ninguno)', async () => {
    const { svc, crear } = build({ ajustes: { clientesBloqueados: [] }, cuadro: [{ numberOrderSales: 11282, numberPF: '11490', tipo: 'completa', cliente: 'OBEN DISTRIBUIDORA COLOMBIA SAS' }] });
    await svc.facturar((await svc.registrarManual('11490', '1')).id);
    expect(crear()).toBe(1);
  });

  it('si el cuadro de Oben la muestra FACTURADA, queda "ya_facturada" sin llamar a Oben', async () => {
    const { svc, crear, hub } = build({ cuadro: [{ numberOrderSales: 11400, numberPF: '11611', tipo: 'completa', estadoOben: 'FACTURADA', cliente: 'ETICAP' }] });
    const f = await svc.facturarOvNacional(11400, new Date('2026-10-23T14:00:00Z'));
    expect(f.estado).toBe('ya_facturada');
    expect(crear()).toBe(0);
    expect(hub.call).not.toHaveBeenCalledWith('obenCostOrder', 'factura.crear', expect.anything(), expect.anything());
  });

  it('tope diario de llamadas', async () => {
    const { svc, crear } = build({ ajustes: { maxLlamadasDia: 2 } });
    for (const pf of ['11611', '11612']) await svc.facturar((await svc.registrarManual(pf, '1')).id);
    const f = await svc.registrarManual('11613', '1');
    await expect(svc.facturar(f.id)).rejects.toThrow(/tope de 2 llamadas/);
    expect(crear()).toBe(2);
  });

  it('una llamada que salió y nunca volvió (proceso caído) bloquea la solicitud hasta que una persona verifique', async () => {
    const { svc, llamadas, crear } = build();
    const f = await svc.registrarManual('11611', '1');
    llamadas.filas.push({ id: 'viejo', tenantId: 't1', solicitudId: f.id, resultado: 'enviada', createdAt: new Date('2026-10-22T15:00:00Z') });
    await expect(svc.facturar(f.id)).rejects.toThrow(/no terminó/);
    expect(crear()).toBe(0);
  });
});
