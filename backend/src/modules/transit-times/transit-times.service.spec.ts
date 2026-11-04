import { TransitTimesService, claveTexto, incotermSigla, limpiarNombre } from './transit-times.service';

function fila(pais: string, puerto: string, incoterm: string, o: number, i: number) {
  return { id: `${pais}-${puerto}-${incoterm}`, tenantId: 't1', pais, puerto, incoterm, oceanDays: o, inlandDays: i, totalDays: o + i, paisClave: claveTexto(pais), puertoClave: claveTexto(puerto) };
}

function armar(filas: ReturnType<typeof fila>[]) {
  const guardados: unknown[] = [];
  const repo = {
    find: jest.fn(async (opts: { where: Record<string, string> }) => filas.filter((f) => Object.entries(opts.where).every(([k, v]) => k === 'tenantId' || (f as Record<string, unknown>)[k] === v))),
    create: jest.fn((x: object) => ({ ...x })),
    save: jest.fn(async (x: unknown) => {
      guardados.push(x);
      return x;
    }),
  };
  return { svc: new TransitTimesService(repo as never, { tenantId: 't1' } as never), guardados };
}

describe('nombres', () => {
  it('claves sin tildes ni signos', () => {
    expect(claveTexto('BOGOTÁ, D.C.')).toBe('BOGOTADC');
    expect(limpiarNombre('MIAMI-')).toBe('MIAMI');
    expect(limpiarNombre('BOGOT�, D.C.')).toBe('BOGOTÁ, D.C');
    expect(claveTexto(limpiarNombre('BOGOT�, D.C.'))).toBe(claveTexto('BOGOTÁ, D.C.'));
    expect(incotermSigla('FREE ON BOARD')).toBe('FOB');
    expect(incotermSigla('exworks')).toBe('EXW');
  });
});

describe('TransitTimesService.despacho', () => {
  it('DORFAN: Bogotá DDP son 3 días hábiles → entrega vie 18-dic, despacho mar 15-dic', async () => {
    const { svc } = armar([fila('COLOMBIA', 'BOGOTÁ, D.C.', 'DDP', 0, 3)]);
    const d = await svc.despacho('2026-12-18', { pais: 'COLOMBIA', puerto: 'BOGOTÁ, D.C.', incoterm: 'DDP' });
    expect(d.fecha).toBe('2026-12-15');
    expect(d.mensaje).toMatch(/3 día\(s\) hábil/);
  });

  it('salta festivos: entrega mié 9-dic con 2 días → vie 4-dic (el 8 es festivo)', async () => {
    const { svc } = armar([fila('COLOMBIA', 'ENVIGADO', 'DDP', 0, 2)]);
    expect((await svc.despacho('2026-12-09', { puerto: 'envigado', incoterm: 'ddp' })).fecha).toBe('2026-12-04');
  });

  it('sin tiempo cargado no inventa fecha', async () => {
    const { svc } = armar([]);
    const d = await svc.despacho('2026-12-18', { puerto: 'NOWHERE', incoterm: 'DDP' });
    expect(d.fecha).toBeNull();
    expect(d.mensaje).toMatch(/No hay tiempo de tránsito/);
  });

  it('el mismo puerto en dos países se distingue por país', async () => {
    const { svc } = armar([fila('USA', 'MONTREAL', 'DDP', 9, 12), fila('CANADA', 'MONTREAL', 'DDP', 18, 2)]);
    expect((await svc.buscar({ pais: 'CANADA', puerto: 'Montreal', incoterm: 'DDP' }))?.totalDays).toBe(20);
    expect((await svc.buscar({ pais: 'USA', puerto: 'Montreal', incoterm: 'DDP' }))?.totalDays).toBe(21);
  });
});

describe('TransitTimesService.importTransitos', () => {
  const cab = ['PAIS', 'PUERTO DESTINO', 'INCONTERM', 'OCEAN (DIAS)', 'INLAND (DIAS)', 'TOTAL (DIAS)'];
  const rows = (...r: Array<Record<string, string | number>>) => r;

  it('lee el formato del Excel de Oben, repara tildes y deja el tiempo más largo si hay repetidos', async () => {
    const { svc, guardados } = armar([]);
    const mk = (p: string, pu: string, i: string, o: number, n: number, t: number) => Object.fromEntries(cab.map((c, k) => [c, [p, pu, i, o, n, t][k]]));
    const r = await svc.importTransitos({
      rows: rows(mk('COLOMBIA', 'BOGOT�, D.C.', 'DDP', 0, 3, 3), mk('ALEMANIA', 'LENGERICH ', 'DDP', 5, 1, 6), mk('ALEMANIA', 'LENGERICH', 'DDP', 18, 1, 19), mk('COLOMBIA', 'GALAPA', 'EXWORKS', 0, 0, 0)),
    });
    expect(r.errores).toEqual([]);
    expect(r.total).toBe(3);
    expect(r.filas.find((f) => f.puerto === 'LENGERICH')?.totalDays).toBe(19);
    expect(r.filas.find((f) => f.puerto.startsWith('BOGOT'))?.puerto).toBe('BOGOTÁ, D.C');
    expect(r.filas.find((f) => f.puerto === 'GALAPA')?.incoterm).toBe('EXW');
    expect(guardados).toHaveLength(3);
  });

  it('todo o nada: un TOTAL que no suma bloquea la carga', async () => {
    const { svc, guardados } = armar([]);
    const mk = (t: number) => Object.fromEntries(cab.map((c, k) => [c, ['COLOMBIA', 'CALI', 'DDP', 3, 0, t][k]]));
    const r = await svc.importTransitos({ rows: rows(mk(9)) });
    expect(r.errores[0].error).toMatch(/TOTAL \(9\) no es OCEAN \+ INLAND \(3\)/);
    expect(guardados).toHaveLength(0);
  });
});

describe('TransitTimesService — mar en días calendario, tierra en días hábiles (Alejandra, 4-nov)', () => {
  it('Salvador de Bahía CFR: 24 días de mar son 24 días CORRIDOS antes, ajustados al día hábil anterior', async () => {
    const { svc } = armar([fila('BRASIL', 'SALVADOR BAHIA', 'CFR', 24, 0)]);
    const d = await svc.despacho('2026-12-28', { pais: 'BRASIL', puerto: 'Salvador Bahia', incoterm: 'CFR' });
    // 28-dic − 24 días corridos = 4-dic-2026 (viernes, hábil).
    expect(d.fecha).toBe('2026-12-04');
    expect(d.mensaje).toMatch(/24 día\(s\) de mar \(calendario\)/);
  });

  it('si al restar cae en fin de semana, baja al viernes hábil', async () => {
    const { svc } = armar([fila('BRASIL', 'SALVADOR BAHIA', 'CFR', 25, 0)]);
    // 13-ene-2027 − 25 = 19-dic-2026 (sábado) → viernes 18-dic.
    expect((await svc.despacho('2027-01-13', { puerto: 'SALVADOR BAHIA', incoterm: 'CFR' })).fecha).toBe('2026-12-18');
  });

  it('puerto con mar y tierra: primero hábiles de tierra y luego corridos de mar', async () => {
    const { svc } = armar([fila('USA', 'HOUSTON', 'DDP', 10, 4)]);
    // 18-dic-2026 (vie) − 4 hábiles = 14-dic (lun) − 10 corridos = 4-dic (vie).
    expect((await svc.despacho('2026-12-18', { puerto: 'HOUSTON', incoterm: 'DDP' })).fecha).toBe('2026-12-04');
  });

  it('el incoterm y el puerto que dice el pedido se detectan solos', async () => {
    const { svc } = armar([fila('BRASIL', 'RIO GRANDE', 'CFR', 25, 0), fila('BRASIL', 'SANTOS', 'CFR', 12, 0)]);
    const r = await svc.detectarEnTexto('cerramos la venta al precio de USD 2,60 CFR Puerto do Rio Grande y pago a 90 días. PORTO: RIO GRANDE - RIO GRANDE DO SUL');
    expect(r.incoterm).toBe('CFR');
    expect(r.puerto).toEqual({ pais: 'BRASIL', puerto: 'RIO GRANDE' });
  });

  it('con dos puertos distintos en el texto no adivina', async () => {
    const { svc } = armar([fila('BRASIL', 'RIO GRANDE', 'CFR', 25, 0), fila('BRASIL', 'SANTOS', 'CFR', 12, 0)]);
    expect((await svc.detectarEnTexto('desde Santos hasta Rio Grande')).puerto).toBeNull();
  });
});

describe('TransitTimesService.buscar — el mismo puerto con otro nombre (Oben: RIO GRANDE DO SUL)', () => {
  it('"RIO GRANDE DO SUL" encuentra "RIO GRANDE" CFR (25 días de mar) si es el único', async () => {
    const { svc } = armar([fila('BRASIL', 'RIO GRANDE', 'CFR', 25, 0), fila('BRASIL', 'SANTOS', 'CFR', 12, 0)]);
    const d = await svc.despacho('2027-01-13', { pais: 'BRASIL', puerto: 'RIO GRANDE DO SUL', incoterm: 'CFR' });
    expect(d.tiempo?.totalDays).toBe(25);
    expect(d.fecha).toBe('2026-12-18'); // 13-ene − 25 días = sáb 19-dic → viernes 18
  });
  it('si hay dos candidatos parecidos no adivina', async () => {
    const { svc } = armar([fila('BRASIL', 'RIO GRANDE', 'CFR', 25, 0), fila('BRASIL', 'RIO GRANDE DO', 'CFR', 26, 0)]);
    expect((await svc.buscar({ pais: 'BRASIL', puerto: 'RIO GRANDE DO SUL', incoterm: 'CFR' }))).toBeNull();
  });
});
