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
