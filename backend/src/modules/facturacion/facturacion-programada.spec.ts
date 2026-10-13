import { BadRequestException } from '@nestjs/common';
import { FacturasParcialesService, fechaHoraBogota } from './facturas-parciales.service';

type Fila = Record<string, unknown>;

/** Repositorio en memoria que respeta el `where` (igualdad e `In`), suficiente para estas pruebas. */
function repoEnMemoria(filas: Fila[], prefijo: string) {
  const coincide = (f: Fila, w: Fila) =>
    Object.entries(w).every(([k, v]) => {
      const op = v as { _type?: string; _value?: unknown[] };
      return op && op._type === 'in' ? (op._value ?? []).includes(f[k]) : f[k] === v;
    });
  return {
    findOne: jest.fn(async ({ where }: { where: Fila }) => filas.find((f) => coincide(f, where)) ?? null),
    find: jest.fn(async ({ where }: { where: Fila }) => filas.filter((f) => coincide(f, where))),
    create: jest.fn((x: Fila) => ({ ...x })),
    save: jest.fn(async (x: Fila) => {
      const f = { id: `${prefijo}${filas.length + 1}`, ...x };
      filas.push(f);
      return f;
    }),
    update: jest.fn(async (where: Fila, cambios: Fila) => {
      const f = filas.find((x) => coincide(x, where));
      if (f) Object.assign(f, cambios);
      return { affected: f ? 1 : 0 };
    }),
    delete: jest.fn(async (where: Fila) => {
      const antes = filas.length;
      for (let i = filas.length - 1; i >= 0; i -= 1) if (coincide(filas[i], where)) filas.splice(i, 1);
      return { affected: antes - filas.length };
    }),
  };
}

// Órdenes REALES del cuadro que Oben envió el 2026-10-13 ("esto es lo que se va a facturar hoy").
const OVS: Record<number, { pf: string; pais: string }> = {
  11341: { pf: '11546', pais: 'COLOMBIA' }, // AMCOR FLEXIBLES CALI — CERRADA
  11235: { pf: '11374', pais: 'COLOMBIA' }, // PLASMAR — CERRADA
  11256: { pf: '11457', pais: 'USA' }, // BAYSHORE FILMS LLC — CERRADA (exportación)
  10963: { pf: '11126', pais: 'COLOMBIA' }, // FLEXO SPRING — POR CERRAR
  11052: { pf: '11228', pais: 'COLOMBIA' }, // LITOPLAS — SALDO PENDIENTE
  11031: { pf: '11198', pais: 'COLOMBIA' }, // FLEXIPACK — SALDO PENDIENTE
};
const HOY = '2026-10-13';
/** 10:30 a. m. en Bogotá. */
const MANANA_1030 = new Date('2026-10-13T15:30:00Z');

function armar(
  opts: {
    ajustes?: Record<string, unknown>;
    ahora?: Date;
    programadas?: Array<{ ov: number; pf?: string; tipo?: string; fecha?: string }>;
    /** OV → fecha y hora en que salió su Lista de Empaque (cerró); `ok:false` = el envío falló. */
    cerradas?: Record<number, { en: Date; ok?: boolean }>;
    solicitudes?: Fila[];
  } = {},
) {
  const filas: Fila[] = (opts.solicitudes ?? []).map((s, i) => ({ id: `s${i + 1}`, tenantId: 't1', ...s }));
  const prog: Fila[] = (opts.programadas ?? []).map((p, i) => ({
    id: `p${i + 1}`,
    tenantId: 't1',
    fecha: p.fecha ?? HOY,
    numberOrderSales: p.ov,
    numberPF: p.pf ?? OVS[p.ov].pf,
    tipo: p.tipo ?? 'completa',
  }));
  const repo = repoEnMemoria(filas, 'f');
  const programadas = repoEnMemoria(prog, 'p');
  const tenants = { findOne: jest.fn(async () => ({ settings: { facturacion: { soloProgramadas: true, ...(opts.ajustes ?? {}) } } })) };
  const ctx = { tenantId: 't1', userId: 'u1' };
  const hub = {
    call: jest.fn(async (_s: string, op: string, args: { procedure?: string; numberOrderSales?: number; numberPF?: string }) => {
      if (op === 'query.run' && args.procedure === 'spEmpaqueUnificada_Paradixe') {
        const o = OVS[Number(args.numberOrderSales)];
        return { ok: true, mode: 'real', data: o ? { Pais: o.pais, Proforma: o.pf } : null };
      }
      if (op === 'query.run') return { ok: true, mode: 'real', data: [] }; // el listado de COMEX no trae las nacionales
      if (op === 'liquidacion.consultar') {
        const ov = Object.entries(OVS).find(([, o]) => o.pf === args.numberPF)?.[0];
        return { ok: true, mode: 'real', data: { OrdenVenta: ov ? Number(ov) : null } };
      }
      return { ok: true, mode: 'real', data: { isSuccessful: true, Code: '200' } }; // factura.crear y correo
    }),
  };
  const audit = {
    log: jest.fn(),
    listForEntity: jest.fn(async (_tipo: string, id: string) => {
      const c = opts.cerradas?.[Number(id)];
      return c ? [{ action: 'ov_approved_lista_empaque_enviada', createdAt: c.en, outputData: { ok: c.ok ?? true } }] : [];
    }),
  };
  const listas = { resolveRecipients: jest.fn(async () => ({ to: ['facturacion@oben.com'], cc: [], bcc: [] })) };
  const svc = new FacturasParcialesService(repo as never, tenants as never, ctx as never, hub as never, audit as never, listas as never, programadas as never);
  svc.esperaVerificacionMs = 0;
  svc.reloj = () => opts.ahora ?? MANANA_1030;
  const facturasPedidas = () => hub.call.mock.calls.filter((c) => c[1] === 'factura.crear').map((c) => c[2] as { numberPF: string; numberDistribucion: string });
  return { svc, hub, filas, prog, audit, facturasPedidas };
}

describe('fechaHoraBogota', () => {
  it('Bogotá es UTC−5 todo el año: la madrugada UTC todavía es el día anterior', () => {
    expect(fechaHoraBogota(new Date('2026-10-13T03:30:00Z'))).toEqual({ fecha: '2026-10-12', minutos: 22 * 60 + 30 });
    expect(fechaHoraBogota(new Date('2026-10-13T21:00:00Z'))).toEqual({ fecha: '2026-10-13', minutos: 16 * 60 });
  });
});

describe('Facturación programada (WO-032): solo se factura lo que Oben programó para hoy', () => {
  it('una orden que NO está en la programación de hoy no se factura, aunque sea nacional y cierre', async () => {
    const { svc, facturasPedidas } = armar({ programadas: [{ ov: 11235 }] });
    const r = await svc.facturarOvNacional(11341);
    expect(r.estado).toBe('omitida');
    expect(r.motivo).toMatch(/No está en la programación de facturación de hoy \(2026-10-13\)/);
    expect(facturasPedidas()).toEqual([]);
  });

  it('programada para hoy y cierra antes del corte: se factura el pedido completo', async () => {
    const { svc, facturasPedidas } = armar({ programadas: [{ ov: 11341 }] });
    expect(await svc.facturarOvNacional(11341)).toMatchObject({ estado: 'facturada', numberPF: '11546' });
    expect(facturasPedidas()).toEqual([{ numberPF: '11546', numberDistribucion: '' }]);
  });

  it('programada pero cierra a las 4:05 p. m.: pasó el corte de las 4, no se factura hoy', async () => {
    const { svc, facturasPedidas } = armar({ programadas: [{ ov: 11341 }], ahora: new Date('2026-10-13T21:05:00Z') });
    const r = await svc.facturarOvNacional(11341);
    expect(r.estado).toBe('omitida');
    expect(r.motivo).toMatch(/Cerró a las 16:05, después del corte de las 16:00/);
    expect(facturasPedidas()).toEqual([]);
  });

  it('el corte es configurable (settings.facturacion.horaCorte) y exactamente a la hora de corte ya no entra', async () => {
    const a = armar({ programadas: [{ ov: 11341 }], ajustes: { horaCorte: '17:00' }, ahora: new Date('2026-10-13T21:05:00Z') });
    expect((await a.svc.facturarOvNacional(11341)).estado).toBe('facturada');
    const b = armar({ programadas: [{ ov: 11341 }], ahora: new Date('2026-10-13T21:00:00Z') });
    expect((await b.svc.facturarOvNacional(11341)).estado).toBe('omitida');
  });

  it('cerrada en un día anterior (incluso tarde) y programada para hoy: sí se factura hoy', async () => {
    const { svc } = armar({ programadas: [{ ov: 11341 }], ahora: new Date('2026-10-13T21:30:00Z') });
    const cerroAyer = new Date('2026-10-12T22:10:00Z'); // 5:10 p. m. del 12
    expect((await svc.facturarOvNacional(11341, cerroAyer)).estado).toBe('facturada');
  });

  it('si la proforma de la programación no coincide con la que tiene Oben para esa orden, no se factura', async () => {
    const { svc, facturasPedidas } = armar({ programadas: [{ ov: 11341, pf: '11548' }] });
    const r = await svc.facturarOvNacional(11341);
    expect(r.estado).toBe('omitida');
    expect(r.motivo).toMatch(/La programación dice PF 11548 y Oben dice PF 11546/);
    expect(facturasPedidas()).toEqual([]);
  });

  it('programada como PARCIAL (saldo pendiente): no se pide la factura del pedido completo', async () => {
    const { svc, facturasPedidas } = armar({ programadas: [{ ov: 11052, tipo: 'parcial' }] });
    const r = await svc.facturarOvNacional(11052);
    expect(r.estado).toBe('omitida');
    expect(r.motivo).toMatch(/programada como factura PARCIAL/);
    expect(facturasPedidas()).toEqual([]);
  });

  it('sin el interruptor soloProgramadas todo sigue como antes: factura al cerrar sin mirar la programación', async () => {
    const { svc } = armar({ ajustes: { soloProgramadas: false } });
    expect((await svc.facturarOvNacional(11341)).estado).toBe('facturada');
  });

  it('correo "Facturar Parcial": se factura solo si su proforma está programada para hoy; si no, queda pendiente con el motivo', async () => {
    const correo = (pf: string, dist: string) => ({
      from: 'notif.app.co@obengroup.com',
      subject: `Proforma ${pf} - Facturar Parcial`,
      body: `Numero de Proforma: ${pf} - Numero de Distribucion: ${dist}`,
      messageId: `<${pf}-${dist}>`,
    });
    const { svc, facturasPedidas } = armar({ ajustes: { parcialAutomatica: true }, programadas: [{ ov: 11052, tipo: 'parcial' }] });

    expect((await svc.registrarDesdeCorreo(correo('11228', '11120'))).estado).toBe('facturada');
    const fuera = await svc.registrarDesdeCorreo(correo('11198', '11121'));
    expect(fuera.estado).toBe('pendiente');
    expect(String(fuera.error)).toMatch(/No está en la programación de facturación de hoy/);
    expect(facturasPedidas()).toEqual([{ numberPF: '11228', numberDistribucion: '11120' }]);
  });
});

describe('programarDia: cargar el cuadro del día', () => {
  const cuadro = [
    { ov: 11341, pf: '11546', estadoOben: 'CERRADA', cliente: 'AMCOR FLEXIBLES CALI S.A.S' },
    { ov: 10963, pf: '11126', estadoOben: 'POR CERRAR', cliente: 'FLEXO SPRING S.A.S' },
    { ov: 11052, pf: '11228', tipo: 'parcial' as const, estadoOben: 'SALDO PENDIENTE', cliente: 'LITOPLAS S.A.' },
  ];

  it('guarda las órdenes del día y deja rastro en la auditoría; cargar no factura nada', async () => {
    const { svc, prog, audit, facturasPedidas } = armar();
    const r = await svc.programarDia(HOY, cuadro);
    expect(r).toHaveLength(3);
    expect(prog.map((p) => [p.numberOrderSales, p.numberPF, p.tipo, p.estadoOben])).toEqual([
      [11341, '11546', 'completa', 'CERRADA'],
      [10963, '11126', 'completa', 'POR CERRAR'],
      [11052, '11228', 'parcial', 'SALDO PENDIENTE'],
    ]);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'facturacion_programacion_cargada', entityId: HOY }));
    expect(facturasPedidas()).toEqual([]);
  });

  it('volver a cargar REEMPLAZA el día: retira lo que ya no está, conserva lo demás y agrega lo nuevo', async () => {
    const { svc, prog } = armar();
    await svc.programarDia(HOY, cuadro);
    await svc.programarDia(HOY, [cuadro[0], { ov: 11235, pf: '11374' }]);
    expect(prog.map((p) => p.numberOrderSales).sort()).toEqual([11235, 11341]);
  });

  it('rechaza una fecha pasada, una orden o proforma inválida y la misma orden con dos proformas', async () => {
    const { svc } = armar();
    await expect(svc.programarDia('2026-10-12', cuadro)).rejects.toThrow(/fecha pasada/);
    await expect(svc.programarDia('13/10/2026', cuadro)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.programarDia(HOY, [{ ov: 0, pf: '11546' }])).rejects.toThrow(/Orden de venta inválida/);
    await expect(svc.programarDia(HOY, [{ ov: 11341, pf: 'PF-11546' }])).rejects.toThrow(/proforma numérica/);
    await expect(svc.programarDia(HOY, [{ ov: 11341, pf: '11546' }, { ov: 11341, pf: '11547' }])).rejects.toThrow(/dos veces con proformas distintas/);
  });

  it('se puede programar un día futuro (los fines de semana se planean el viernes)', async () => {
    const { svc, prog } = armar();
    await svc.programarDia('2026-10-17', [cuadro[0]]);
    expect(prog[0]).toMatchObject({ fecha: '2026-10-17', numberOrderSales: 11341 });
  });
});

describe('facturarProgramadasDeHoy: factura lo que ya se puede y deja esperando lo demás', () => {
  const cerroHoy = { en: new Date('2026-10-13T14:00:00Z') }; // 9:00 a. m.

  it('cuadro real del 13-oct: factura las nacionales cerradas, espera las que no han cerrado y no toca exportación', async () => {
    const { svc, facturasPedidas } = armar({
      programadas: [{ ov: 11341 }, { ov: 11235 }, { ov: 11256 }, { ov: 10963 }, { ov: 11052, tipo: 'parcial' }],
      cerradas: { 11341: cerroHoy, 11235: cerroHoy, 11256: cerroHoy },
    });
    const r = await svc.facturarProgramadasDeHoy();
    const de = (ov: number) => r.find((x) => x.ov === ov);

    expect(de(11341)?.resultado).toBe('facturada');
    expect(de(11235)?.resultado).toBe('facturada');
    expect(de(11256)).toMatchObject({ resultado: 'omitida', detalle: expect.stringMatching(/solo se facturan pedidos nacionales/) });
    expect(de(10963)?.resultado).toBe('espera_cierre');
    expect(de(11052)?.resultado).toBe('espera_correo_parcial');
    // Solo las dos nacionales cerradas, cada una como pedido completo (distribución vacía).
    expect(facturasPedidas().map((f) => f.numberPF).sort()).toEqual(['11374', '11546']);
    expect(facturasPedidas().every((f) => f.numberDistribucion === '')).toBe(true);
  });

  it('volver a correrla no repite facturas: lo ya pedido sale como "ya_solicitada"', async () => {
    const { svc, facturasPedidas } = armar({ programadas: [{ ov: 11341 }], cerradas: { 11341: cerroHoy } });
    await svc.facturarProgramadasDeHoy();
    const r = await svc.facturarProgramadasDeHoy();
    expect(r[0]).toMatchObject({ resultado: 'ya_solicitada', detalle: 'pedido completo: facturada' });
    expect(facturasPedidas()).toHaveLength(1);
  });

  it('un envío FALLIDO de la Lista de Empaque no cuenta como orden cerrada', async () => {
    const { svc, facturasPedidas } = armar({ programadas: [{ ov: 11341 }], cerradas: { 11341: { en: cerroHoy.en, ok: false } } });
    expect((await svc.facturarProgramadasDeHoy())[0].resultado).toBe('espera_cierre');
    expect(facturasPedidas()).toEqual([]);
  });

  it('cerró hoy después del corte: tampoco se factura al cargar el cuadro', async () => {
    const { svc, facturasPedidas } = armar({
      programadas: [{ ov: 11341 }],
      cerradas: { 11341: { en: new Date('2026-10-13T21:20:00Z') } },
      ahora: new Date('2026-10-13T21:40:00Z'),
    });
    const r = await svc.facturarProgramadasDeHoy();
    expect(r[0]).toMatchObject({ resultado: 'omitida', detalle: expect.stringMatching(/después del corte/) });
    expect(facturasPedidas()).toEqual([]);
  });

  it('parciales: con su correo y la factura parcial automática encendida se facturan con el número de distribución; apagada, esperan el botón', async () => {
    const solicitud = { numberPF: '11228', numeroDistribucion: '11120', origen: 'correo', estado: 'pendiente' };
    const on = armar({ ajustes: { parcialAutomatica: true }, programadas: [{ ov: 11052, tipo: 'parcial' }], solicitudes: [solicitud] });
    expect((await on.svc.facturarProgramadasDeHoy())[0]).toMatchObject({ resultado: 'facturada', detalle: 'distribución 11120' });
    expect(on.facturasPedidas()).toEqual([{ numberPF: '11228', numberDistribucion: '11120' }]);

    const off = armar({ programadas: [{ ov: 11052, tipo: 'parcial' }], solicitudes: [{ ...solicitud }] });
    expect((await off.svc.facturarProgramadasDeHoy())[0]).toMatchObject({ resultado: 'omitida', detalle: expect.stringMatching(/se factura con el botón/) });
    expect(off.facturasPedidas()).toEqual([]);
  });

  it('con la facturación SUSPENDIDA no se pide nada', async () => {
    const { svc, facturasPedidas } = armar({ ajustes: { suspendida: true }, programadas: [{ ov: 11341 }], cerradas: { 11341: cerroHoy } });
    expect((await svc.facturarProgramadasDeHoy())[0]).toMatchObject({ resultado: 'omitida', detalle: expect.stringMatching(/suspendida/) });
    expect(facturasPedidas()).toEqual([]);
  });

  it('lo programado para otro día no se factura hoy', async () => {
    const { svc, facturasPedidas } = armar({ programadas: [{ ov: 11341, fecha: '2026-10-14' }], cerradas: { 11341: cerroHoy } });
    expect(await svc.facturarProgramadasDeHoy()).toEqual([]);
    expect(facturasPedidas()).toEqual([]);
  });
});
