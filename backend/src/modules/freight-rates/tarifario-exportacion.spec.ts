import * as XLSX from 'xlsx';
import { BadRequestException } from '@nestjs/common';
import { estadoDe, fechaExcel, leerTarifarioExportacion, nombreProveedor, puertoCorto } from './tarifario-exportacion';
import { TarifarioExportacionService } from './tarifario-exportacion.service';

/** Un tarifario con el formato real de COMEX ("Fletes Exportacion_Oben Octubre 2026.xlsx"), filas copiadas del archivo. */
function libro(opts: { sinLeg3?: boolean; leg2?: unknown[][]; leg3?: unknown[][] } = {}): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CÓMO LLENAR EL ARCHIVO DE FLETES']]), 'Instrucciones');
  const enc2 = ['Company', 'Origin', 'Destination', 'ContainerType', 'Forwarder', 'ShippingLine', 'TransitPoint1', 'TransitPoint2', 'PortDwellTime', 'RampDwellTime', 'TransportTime', 'DwellTime', 'DaysMin', 'DaysMax', 'FreeDaysDemurrage', 'FreeDaysDetention', 'Total', 'CarrierDestinationCharges', 'IsPartial', 'Currency', 'EffectiveDate', 'ExpirationDate', 'Contrato #', 'nota'];
  const leg2 = opts.leg2 ?? [
    ['OBEN COLOMBIA S.A.S', 'Cartagena, Colombia (COCTG) - Port', 'Itapoa, SC, 89249-000, Brazil (BRIOA) - Port', "FCL 40'", 'Direct', 'Maersk', null, null, 1, 1, 17, 2, 19, null, null, 9, 324, null, 'No', 'USD', 46266, 46387, null, null],
    ['OBEN COLOMBIA S.A.S', 'Cartagena, Colombia (COCTG) - Port', 'Atlanta, GA, United States (USATL) - Ramp', "FCL 40'", 'Trading ', 'HAPAG LLOYD', 'Savannah, GA, United States (USSAV) - Port', null, 3, 3, 14, 6, 20, null, 4, 7, 2730, null, 'No', 'USD', 46266, 46295, 'Q2609BOG00172 ', null],
    ['OBEN COLOMBIA S.A.S', 'Cartagena, Colombia (COCTG) - Port', 'New Orleans, LA, United States (USMSY) - Port', "FCL 40'", 'Transborder', 'Hapag-Lloyd', null, null, 1, 0, 13, 1, 14, null, 4, 4, 0, null, null, null, null, null, null, null],
    ['OBEN COLOMBIA S.A.S', 'Cartagena, Colombia (COCTG) - Port', 'Gdansk, Poland (PLGDN) - Port', "FCL 40'", 'Direct', 'CMA CGM', null, null, 1, 1, 27, 2, 29, null, null, null, null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([enc2, ...leg2]), 'Update - Freight Leg2');
  if (!opts.sinLeg3) {
    const enc3 = ['Company', 'Origin', 'Customer', 'Destination', 'ContainerType', 'Forwarder', 'ShippingLine', 'TransportTime', 'GrossPayload', 'NetPayload', 'PayloadCountry', 'Total', 'DestinationCharges', 'CustomsCommission', 'IsPartial', 'Currency', 'EffectiveDate', 'ExpirationDate', null, 'nota'];
    const leg3 = opts.leg3 ?? [
      ['OBEN COLOMBIA S.A.S', 'Atlanta, GA, United States (USATL) - Ramp', null, 'Birmingham, AL 35234', "FCL 40'", 'TRANSBORDER', null, 1, 19958, 18458, null, 2130, null, 270, 'Si', 'USD', 46296, 46326, null, null],
      ['OBEN COLOMBIA S.A.S', 'Cincinnati, OH, United States (USCVG) - Ramp', null, 'Cincinnati, OH 45240', "FCL 40'", 'shapiro', null, 1, 24493.97, 22993.97, null, 523, null, 240, 'Si', 'USD', 46266, 46326, null, null],
      ['OBEN COLOMBIA S.A.S', 'Toronto, ON, Canada (CATOR) - Ramp', null, 'Brampton, ON L6T 4B3', "FCL 40'", 'Shapiro', null, 1, 24493.97, 22993.97, null, 945, null, null, 'No', 'USD', 46252, 46265, null, null],
      ['OBEN COLOMBIA S.A.S', 'Veracruz, Mexico (MXVER) - Port', null, 'Puebla, PUE', "FCL 40'", 'Direct', null, 1, null, null, null, 800, null, null, 'No', 'USD', 46252, 46265, null, null],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([enc3, ...leg3]), 'Update - Freight Leg3');
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('lector del tarifario de exportación de COMEX (patas 2 y 3)', () => {
  it('lee la pata 2 (marítimo) y la pata 3 (Inland) con el mismo formato que usa la liquidación', () => {
    const t = leerTarifarioExportacion(libro());
    expect(t.maritimas).toHaveLength(2);
    expect(t.maritimas[0]).toEqual({
      origin: 'Cartagena, Colombia (COCTG) - Port',
      destination: 'Itapoa, SC, 89249-000, Brazil (BRIOA) - Port',
      destinationPort: 'Itapoa, SC (Port)',
      containerType: "FCL 40'",
      forwarder: 'Direct',
      shippingLine: 'Maersk',
      transitPoints: null,
      transitDays: 19,
      rateTotal: 324,
      carrierDestinationCharges: null,
      isPartial: false,
      effectiveDate: '2026-09-01',
      validUntil: '2026-12-31',
    });
    expect(t.maritimas[1]).toMatchObject({ destinationPort: 'Atlanta, GA (Ramp)', forwarder: 'Trading', transitPoints: 'Savannah, GA, United States (USSAV) - Port', transitDays: 20 });
    expect(t.inland.map((i) => [i.country, i.forwarder, i.destinationPort, i.state, i.rate40hc, i.customsCommission])).toEqual([
      ['USA', 'Transborder', 'Atlanta, GA (Ramp)', 'AL', 2130, 270],
      ['USA', 'Shapiro', 'Cincinnati, OH (Ramp)', 'OH', 523, 240],
      ['CA', 'Shapiro', 'Toronto, ON (Ramp)', 'ON', 945, null],
    ]);
  });

  it('una tarifa en 0 NO se carga (sería "la más barata" y la liquidación saldría con flete 0); lo que no aplica se lista', () => {
    const t = leerTarifarioExportacion(libro());
    expect(t.maritimas.some((m) => /New Orleans/.test(m.destination))).toBe(false);
    expect(t.descartadas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ hoja: 'Update - Freight Leg2', motivo: 'valor Total en 0' }),
        expect.objectContaining({ hoja: 'Update - Freight Leg2', motivo: 'sin valor Total' }),
        expect.objectContaining({ hoja: 'Update - Freight Leg3', motivo: expect.stringContaining('fuera de EE. UU./Canadá') }),
      ]),
    );
  });

  it('un archivo que no es el tarifario da un error claro', () => {
    expect(() => leerTarifarioExportacion(libro({ sinLeg3: true }))).toThrow(/no tiene las hojas "Update - Freight Leg2" y "Update - Freight Leg3"/);
    expect(() => leerTarifarioExportacion(Buffer.from('hola'))).toThrow();
  });

  it('normaliza puertos, estados, proveedores y fechas como la carga del 1-oct', () => {
    expect(puertoCorto('Buenos Aires, Argentina (ARBUE) - Port')).toBe('Buenos Aires, Argentina (ARBUE) - Port');
    expect(puertoCorto('Altamira, TAM, Mexico (MXATM) - Port')).toBe('Altamira, TAM, Mexico (MXATM) - Port');
    expect(estadoDe('Oshkosh, WI, 54904, United States')).toBe('WI');
    expect(estadoDe('Asheville NC 28803-2114')).toBe('NC');
    expect(estadoDe('ON M1X 1B9 Ontario- Ontario')).toBe('ON');
    expect(estadoDe('1009 Rock Avenue Yakima Wa 98902 USA')).toBe('WA');
    expect(nombreProveedor('SHAPIRO')).toBe('Shapiro');
    expect(nombreProveedor('shapiro')).toBe('Shapiro');
    expect(nombreProveedor('Savino del Bene')).toBe('Savino del Bene');
    expect(fechaExcel(46295)).toBe('2026-09-30');
    expect(fechaExcel('30/09/2026')).toBe('2026-09-30');
  });
});

describe('carga del tarifario desde la pantalla, con histórico', () => {
  function armar(actuales: { maritimas?: Array<Record<string, unknown>>; inland?: Array<Record<string, unknown>> } = {}) {
    const db = {
      ocean: (actuales.maritimas ?? []).map((r) => ({ ...r })),
      inland: (actuales.inland ?? []).map((r) => ({ ...r })),
      cargas: [] as Array<Record<string, unknown>>,
    };
    let seq = 0;
    const tabla = (ent: { name: string }) => (ent.name === 'FreightOceanRate' ? db.ocean : ent.name === 'FreightInlandRate' ? db.inland : db.cargas);
    const manager = {
      create: (_e: unknown, x: Record<string, unknown>) => ({ ...x }),
      save: async (x: Record<string, unknown>) => {
        const t = 'archivo' in x ? db.cargas : 'rateTotal' in x ? db.ocean : db.inland;
        const fila = { id: `id${++seq}`, createdAt: new Date(), ...x };
        t.push(fila);
        return fila;
      },
      update: async (e: { name: string }, where: { id: string }, datos: Record<string, unknown>) => {
        Object.assign(tabla(e).find((r) => r.id === where.id)!, datos);
      },
      delete: async (e: { name: string }, ids: string[]) => {
        const t = tabla(e);
        for (const id of ids) t.splice(t.findIndex((r) => r.id === id), 1);
      },
    };
    const dataSource = { transaction: jest.fn(async (fn: (m: typeof manager) => Promise<void>) => fn(manager)) };
    const repo = (t: () => Array<Record<string, unknown>>) => ({ find: jest.fn(async () => t().map((r) => ({ ...r }))), findOne: jest.fn(async ({ where }: { where: { id: string } }) => t().find((r) => r.id === where.id) ?? null) });
    const audit = { log: jest.fn(async () => undefined) };
    const svc = new TarifarioExportacionService(
      dataSource as never,
      { tenantId: 't1', userId: 'u1' } as never,
      repo(() => db.ocean) as never,
      repo(() => db.inland) as never,
      repo(() => db.cargas) as never,
      audit as never,
    );
    return { svc, db, dataSource, audit };
  }
  const itapoa = { id: 'm-itapoa', origin: 'Cartagena, Colombia (COCTG) - Port', destination: 'Itapoa, SC, 89249-000, Brazil (BRIOA) - Port', destinationPort: 'Itapoa, SC (Port)', containerType: "FCL 40'", forwarder: 'Direct', shippingLine: 'Maersk', transitPoints: null, rateTotal: '324.00', validUntil: '2026-12-31' };
  const vieja = { id: 'm-vieja', origin: 'Cartagena, Colombia (COCTG) - Port', destination: 'Callao, Peru (PECLL) - Port', destinationPort: 'Callao, Peru (PECLL) - Port', containerType: "FCL 40'", forwarder: 'Direct', shippingLine: 'Maersk', transitPoints: null, rateTotal: '1045.00', validUntil: '2026-09-30' };
  const cinci = { id: 'i-cinci', country: 'USA', forwarder: 'Shapiro', destinationPort: 'Cincinnati, OH (Ramp)', state: 'OH', destinationAddress: 'Cincinnati, OH 45240', rate40hc: '600.00', validUntil: '2026-08-31' };

  it('vista previa: dice qué entra, qué cambia de valor y qué sale, sin tocar nada', async () => {
    const { svc, db, dataSource } = armar({ maritimas: [itapoa, vieja], inland: [cinci] });
    const r = await svc.cargar(libro(), 'Fletes Exportacion_Oben Noviembre 2026.xlsx', { confirmar: false, usuario: 'María Escobar' });
    expect(r.aplicado).toBe(false);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(r.maritimas).toMatchObject({ total: 2, nuevas: 1, iguales: 1, quitadas: 1, cambiadas: 0 });
    expect(r.inland).toMatchObject({ total: 3, nuevas: 2, cambiadas: 1 });
    expect(r.cambios[0]).toMatchObject({ tipo: 'inland', proveedor: 'Shapiro', antes: 600, despues: 523 });
    expect(r.avisos.join(' ')).toMatch(/Entry Fee 120, ISF 45, HMF\) no cambian/);
    expect(db.cargas).toHaveLength(0);
  });

  it('al confirmar: reemplaza las tarifas, conserva el id de las que siguen (las rutas escogidas por COMEX valen) y guarda el histórico', async () => {
    const buffer = libro();
    const { svc, db, audit } = armar({ maritimas: [itapoa, vieja], inland: [cinci] });
    const r = await svc.cargar(buffer, 'Fletes Exportacion_Oben Noviembre 2026.xlsx', { confirmar: true, usuario: 'María Escobar' });
    expect(r.aplicado).toBe(true);
    expect(db.ocean.map((x) => x.id)).toContain('m-itapoa'); // la misma tarifa: mismo id
    expect(db.ocean.some((x) => x.id === 'm-vieja')).toBe(false); // no estaba en el archivo: sale
    expect(db.inland.find((x) => x.id === 'i-cinci')).toMatchObject({ rate40hc: 523, customsCommission: '240', sourceFile: 'Fletes Exportacion_Oben Noviembre 2026.xlsx (Leg3)' });
    expect(db.ocean).toHaveLength(2);
    expect(db.inland).toHaveLength(3);
    // Histórico: el archivo original, lo que quedó cargado y el respaldo completo de lo anterior.
    expect(db.cargas).toHaveLength(1);
    const carga = db.cargas[0];
    expect(carga).toMatchObject({ archivo: 'Fletes Exportacion_Oben Noviembre 2026.xlsx', usuarioNombre: 'María Escobar', tamano: buffer.length });
    expect(Buffer.compare(carga.contenido as Buffer, buffer)).toBe(0);
    expect((carga.tarifas as { maritimas: unknown[]; inland: unknown[] }).maritimas).toHaveLength(2);
    expect((carga.respaldo as { maritimas: Array<{ id: string }> }).maritimas.map((x) => x.id)).toEqual(['m-itapoa', 'm-vieja']);
    expect(r.cargaId).toBe(carga.id);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'tarifario_exportacion_cargado' }));
    const historial = await svc.historial();
    expect(historial[0]).toMatchObject({ archivo: 'Fletes Exportacion_Oben Noviembre 2026.xlsx', usuario: 'María Escobar', vigente: true });
    expect((await svc.archivoDeCarga(carga.id as string)).contenido.length).toBe(buffer.length);
  });

  it('un archivo inválido no cambia nada y explica por qué', async () => {
    const { svc, db } = armar({ maritimas: [itapoa] });
    await expect(svc.cargar(libro({ sinLeg3: true }), 'otro.xlsx', { confirmar: true, usuario: null })).rejects.toThrow(BadRequestException);
    expect(db.ocean).toHaveLength(1);
    expect(db.cargas).toHaveLength(0);
  });
});
