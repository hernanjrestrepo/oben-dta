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

// Órdenes REALES del cuadro que Oben envió el 2026-10-13 ("esto es lo que se va a facturar hoy"), con el país y la
// proforma que devolvió Oben para cada una ese día.
const OVS: Record<number, { pf: string; pais: string }> = {
  11341: { pf: '11546', pais: 'COLOMBIA' }, // AMCOR FLEXIBLES CALI — CERRADA
  11235: { pf: '11374', pais: 'COLOMBIA' }, // PLASMAR — CERRADA
  11256: { pf: '11457', pais: 'USA' }, // BAYSHORE FILMS LLC — CERRADA (exportación)
  11039: { pf: '11235', pais: 'COLOMBIA' }, // OBEN DISTRIBUIDORA — POR CERRAR
  10963: { pf: '11126', pais: 'COLOMBIA' }, // FLEXO SPRING — POR CERRAR, con parcial pedido el viernes 4:02 p. m.
  11052: { pf: '11228', pais: 'COLOMBIA' }, // LITOPLAS — SALDO PENDIENTE, con parcial pedido el viernes
  11031: { pf: '11198', pais: 'COLOMBIA' }, // FLEXIPACK — SALDO PENDIENTE
};
const HOY = '2026-10-13';
/** 10:30 a. m. en Bogotá. */
const MANANA_1030 = new Date('2026-10-13T15:30:00Z');
const VIERNES_1226 = new Date('2026-10-09T17:26:41Z');
const VIERNES_1522 = new Date('2026-10-09T20:22:42Z');
const VIERNES_1602 = new Date('2026-10-09T21:02:32Z');

const correo = (pf: string, dist: string) => ({
  from: 'notif.app.co@obengroup.com',
  subject: `Proforma ${pf} - Facturar Parcial`,
  body: `Numero de Proforma: ${pf} - Numero de Distribucion: ${dist}`,
  messageId: `<${pf}-${dist}>`,
});

function armar(
  opts: {
    ajustes?: Record<string, unknown>;
    ahora?: Date;
    programadas?: Array<{ ov: number; pf?: string; tipo?: string; fecha?: string }>;
    /** OV → cuándo salió su Lista de Empaque (cerró); `ok:false` = el envío falló. */
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
  const tenants = { findOne: jest.fn(async () => ({ settings: { facturacion: { soloProgramadas: true, parcialAutomatica: true, ...(opts.ajustes ?? {}) } } })) };
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

describe('Facturación programada (WO-032): pedido completo, al cerrar la orden', () => {
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

  it('programada con SALDO PENDIENTE (parcial) y sin correo "Facturar Parcial": no se pide la factura del pedido completo', async () => {
    const { svc, facturasPedidas } = armar({ programadas: [{ ov: 11052, tipo: 'parcial' }] });
    const r = await svc.facturarOvNacional(11052);
    expect(r.estado).toBe('omitida');
    expect(r.motivo).toMatch(/saldo pendiente \(factura PARCIAL\)/);
    expect(facturasPedidas()).toEqual([]);
  });

  it('sin el interruptor soloProgramadas todo sigue como antes: factura al cerrar sin mirar la programación', async () => {
    const { svc } = armar({ ajustes: { soloProgramadas: false } });
    expect((await svc.facturarOvNacional(11341)).estado).toBe('facturada');
  });
});

describe('Facturación programada: parciales ("Facturar Parcial") esperan el cierre de su orden', () => {
  const parcial = (pf: string, dist: string, pedida: Date) => ({ numberPF: pf, numeroDistribucion: dist, origen: 'correo', estado: 'pendiente', createdAt: pedida });

  it('caso real 10963 (POR CERRAR, parcial pedido el viernes 4:02 p. m.): al cerrar la orden se factura ESE parcial, no el pedido completo', async () => {
    const { svc, facturasPedidas } = armar({ programadas: [{ ov: 10963 }], solicitudes: [parcial('11126', '11144', VIERNES_1602)] });
    const r = await svc.facturarOvNacional(10963); // sale su Lista de Empaque hoy a las 10:30
    expect(r).toMatchObject({ estado: 'facturada', motivo: 'distribución 11144: facturada', numberPF: '11126' });
    expect(facturasPedidas()).toEqual([{ numberPF: '11126', numberDistribucion: '11144' }]);
  });

  it('si la factura parcial automática está apagada, al cerrar no se factura: queda para el botón', async () => {
    const { svc, facturasPedidas } = armar({ ajustes: { parcialAutomatica: false }, programadas: [{ ov: 10963 }], solicitudes: [parcial('11126', '11144', VIERNES_1602)] });
    const r = await svc.facturarOvNacional(10963);
    expect(r.estado).toBe('omitida');
    expect(r.motivo).toMatch(/se facturan con el botón/);
    expect(facturasPedidas()).toEqual([]);
  });

  it('un parcial pedido DESPUÉS del último cierre de la orden espera su propio cierre', async () => {
    // La orden cerró el viernes a las 3:22 p. m.; hoy Oben pide otro parcial (otra distribución) que aún no cierra.
    const { svc, facturasPedidas } = armar({
      programadas: [{ ov: 11052, tipo: 'parcial' }],
      cerradas: { 11052: { en: VIERNES_1522 } },
      solicitudes: [parcial('11228', '11199', new Date('2026-10-13T15:00:00Z'))],
    });
    const r = await svc.facturarProgramadasDeHoy();
    expect(r[0]).toMatchObject({ resultado: 'omitida', detalle: expect.stringMatching(/posterior al último cierre/) });
    expect(facturasPedidas()).toEqual([]);
  });

  it('llega el correo y la orden AÚN no cierra: se factura de una vez (José 13-oct: el parcial ya está montado, no espera cierre)', async () => {
    const { svc, filas, facturasPedidas } = armar({ programadas: [{ ov: 11039 }] });
    const f = await svc.registrarDesdeCorreo(correo('11235', '11160'));
    expect(f.estado).toBe('facturada');
    expect(facturasPedidas()).toEqual([{ numberPF: '11235', numberDistribucion: '11160' }]);
    expect(filas[0].estado).toBe('facturada');
  });

  it('llega el correo minutos después del cierre de la orden: se factura de una vez', async () => {
    const { svc, facturasPedidas } = armar({ programadas: [{ ov: 11039 }], cerradas: { 11039: { en: new Date('2026-10-13T15:20:00Z') } } });
    expect((await svc.registrarDesdeCorreo(correo('11235', '11160'))).estado).toBe('facturada');
    expect(facturasPedidas()).toEqual([{ numberPF: '11235', numberDistribucion: '11160' }]);
  });

  it('llega el correo de una proforma que NO está programada para hoy: queda pendiente', async () => {
    const { svc, facturasPedidas } = armar({ programadas: [{ ov: 11039 }] });
    const f = await svc.registrarDesdeCorreo(correo('11198', '11153'));
    expect(f.estado).toBe('pendiente');
    expect(String(f.error)).toMatch(/No está en la programación de facturación de hoy/);
    expect(facturasPedidas()).toEqual([]);
  });

  it('el correo llega después del corte: el parcial se factura igual (el corte aplica al cierre de pedidos completos)', async () => {
    const { svc, facturasPedidas } = armar({
      programadas: [{ ov: 11039 }],
      cerradas: { 11039: { en: new Date('2026-10-13T21:10:00Z') } },
      ahora: new Date('2026-10-13T21:15:00Z'),
    });
    expect((await svc.registrarDesdeCorreo(correo('11235', '11160'))).estado).toBe('facturada');
    expect(facturasPedidas()).toEqual([{ numberPF: '11235', numberDistribucion: '11160' }]);
  });

  it('sin programación diaria (interruptor apagado) el parcial se factura al llegar el correo, como antes', async () => {
    const { svc, facturasPedidas } = armar({ ajustes: { soloProgramadas: false } });
    expect((await svc.registrarDesdeCorreo(correo('11235', '11160'))).estado).toBe('facturada');
    expect(facturasPedidas()).toEqual([{ numberPF: '11235', numberDistribucion: '11160' }]);
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

describe('facturarProgramadasDeHoy: factura lo que ya cerró y deja esperando lo demás', () => {
  const cerroElLunes = { en: new Date('2026-10-12T14:00:00Z') };

  it('cuadro real del 13-oct: completas cerradas, parcial de saldo pendiente ya cerrado, las POR CERRAR esperan y exportación no se toca', async () => {
    const { svc, facturasPedidas } = armar({
      programadas: [{ ov: 11341 }, { ov: 11235 }, { ov: 11256 }, { ov: 11039 }, { ov: 10963 }, { ov: 11052, tipo: 'parcial' }, { ov: 11031, tipo: 'parcial' }],
      cerradas: { 11341: cerroElLunes, 11235: cerroElLunes, 11256: cerroElLunes, 11052: { en: VIERNES_1522 }, 11031: cerroElLunes },
      solicitudes: [
        { numberPF: '11228', numeroDistribucion: '11140', origen: 'correo', estado: 'pendiente', createdAt: VIERNES_1226 }, // LITOPLAS
        { numberPF: '11126', numeroDistribucion: '11144', origen: 'correo', estado: 'pendiente', createdAt: VIERNES_1602 }, // FLEXO SPRING, aún sin cerrar
      ],
    });
    const r = await svc.facturarProgramadasDeHoy();
    const de = (ov: number) => r.find((x) => x.ov === ov);

    expect(de(11341)?.resultado).toBe('facturada'); // completa
    expect(de(11235)?.resultado).toBe('facturada'); // completa
    expect(de(11256)).toMatchObject({ resultado: 'omitida', detalle: expect.stringMatching(/solo se facturan pedidos nacionales/) });
    expect(de(11039)?.resultado).toBe('espera_cierre'); // POR CERRAR, sin parcial
    expect(de(10963)?.resultado).toBe('espera_cierre'); // POR CERRAR, con parcial pedido: espera el cierre
    expect(de(11052)).toMatchObject({ resultado: 'facturada', detalle: 'distribución 11140: facturada' }); // saldo pendiente: su parcial
    expect(de(11031)).toMatchObject({ resultado: 'omitida', detalle: expect.stringMatching(/saldo pendiente \(factura PARCIAL\)/) }); // sin correo parcial
    expect(
      facturasPedidas()
        .map((f) => `${f.numberPF}/${f.numberDistribucion}`)
        .sort(),
    ).toEqual(['11228/11140', '11374/', '11546/']);
  });

  it('volver a correrla no repite facturas', async () => {
    const { svc, facturasPedidas } = armar({ programadas: [{ ov: 11341 }], cerradas: { 11341: cerroElLunes } });
    await svc.facturarProgramadasDeHoy();
    const r = await svc.facturarProgramadasDeHoy();
    expect(r[0]).toMatchObject({ resultado: 'omitida', detalle: expect.stringMatching(/ya tiene una solicitud de factura \(facturada\)/) });
    expect(facturasPedidas()).toHaveLength(1);
  });

  it('un envío FALLIDO de la Lista de Empaque no cuenta como orden cerrada', async () => {
    const { svc, facturasPedidas } = armar({ programadas: [{ ov: 11341 }], cerradas: { 11341: { en: cerroElLunes.en, ok: false } } });
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

  it('con la facturación SUSPENDIDA no se pide nada', async () => {
    const { svc, facturasPedidas } = armar({ ajustes: { suspendida: true }, programadas: [{ ov: 11341 }], cerradas: { 11341: cerroElLunes } });
    expect((await svc.facturarProgramadasDeHoy())[0]).toMatchObject({ resultado: 'omitida', detalle: expect.stringMatching(/suspendida/) });
    expect(facturasPedidas()).toEqual([]);
  });

  it('lo programado para otro día no se factura hoy', async () => {
    const { svc, facturasPedidas } = armar({ programadas: [{ ov: 11341, fecha: '2026-10-14' }], cerradas: { 11341: cerroElLunes } });
    expect(await svc.facturarProgramadasDeHoy()).toEqual([]);
    expect(facturasPedidas()).toEqual([]);
  });

  it('una OV marcada en settings.facturacion.noFacturarOv no se factura aunque esté en el cuadro y haya cerrado', async () => {
    const { svc, facturasPedidas } = armar({ programadas: [{ ov: 11341 }], ajustes: { noFacturarOv: [11341] } });
    const r = await svc.facturarOvNacional(11341);
    expect(r.estado).toBe('omitida');
    expect(r.motivo).toMatch(/marcada para NO facturar/);
    expect(facturasPedidas()).toEqual([]);
  });
});
