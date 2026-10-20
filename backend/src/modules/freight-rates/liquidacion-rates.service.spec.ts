import { LiquidacionRatesService, ciudadDe } from './liquidacion-rates.service';

const TENANT_ID = 't1';

function makeService(surchargeRows: any[], inlandRows: any[] = []) {
  const surcharges = {
    find: jest.fn().mockResolvedValue(surchargeRows),
  } as any;
  const inlandRates = {
    findOne: jest.fn().mockImplementation(() => {
      const row = inlandRows[0] ?? null;
      return Promise.resolve(row);
    }),
    // Simula el ILIKE '%ZIP%' de la consulta real sobre destination_address.
    find: jest.fn().mockImplementation(({ where }: any) => {
      const zip = String(where.destinationAddress.value ?? where.destinationAddress._value ?? '').replace(/%/g, '');
      return Promise.resolve(inlandRows.filter((r) => String(r.destinationAddress).includes(zip)));
    }),
  } as any;
  return new LiquidacionRatesService(surcharges, inlandRates);
}

describe('LiquidacionRatesService (spSettlement_Head — pregunta 9 del documento de Liquidación)', () => {
  // Mismos nombres reales confirmados en freight-rate-import.service.spec.ts (hoja "Destination Surcharges" real de Oben).
  const PERU_ROWS = [
    { tenantId: TENANT_ID, country: 'Peru', surchargeName: 'Importer Security Filing', rateAmount: 20, rateFormula: null },
    { tenantId: TENANT_ID, country: 'Peru', surchargeName: 'Entry Fee', rateAmount: 110, rateFormula: null },
    { tenantId: TENANT_ID, country: 'Peru', surchargeName: 'Harbor Maintenance Fee', rateAmount: null, rateFormula: '0.125% del FOB' },
  ];

  describe('resolveSurcharges', () => {
    it('Postgres devuelve los decimal como TEXTO ("110.0000"): igual salen como números', async () => {
      const service = makeService([
        { tenantId: TENANT_ID, country: 'Colombia', surchargeName: 'Entry Fee', rateAmount: '110.0000', rateFormula: null },
        { tenantId: TENANT_ID, country: 'Colombia', surchargeName: 'Importer Security Filing', rateAmount: '20.0000', rateFormula: null },
        { tenantId: TENANT_ID, country: 'Colombia', surchargeName: 'Harbor Maintenance Fee', rateAmount: null, rateFormula: '0.125% del FOB' },
      ]);

      const result = await service.resolveSurcharges(TENANT_ID, 'Colombia', 7787.39);

      expect(result).toMatchObject({ entryFee: 110, importerSecurityFiling: 20, harborMaintenanceFee: 9.7342, harborMaintenanceFeePct: 0.00125 });
    });

    it('HMF con monto fijo: no hay porcentaje', async () => {
      const service = makeService([{ tenantId: TENANT_ID, country: 'Peru', surchargeName: 'Harbor Maintenance Fee', rateAmount: 30, rateFormula: '0.125% del FOB' }]);
      expect(await service.resolveSurcharges(TENANT_ID, 'PERU', 10_000)).toMatchObject({ harborMaintenanceFee: 30, harborMaintenanceFeePct: null });
    });

    it('resuelve Entry Fee e Importer Security Filing como montos fijos reales', async () => {
      const service = makeService(PERU_ROWS);

      const result = await service.resolveSurcharges(TENANT_ID, 'PERU');

      expect(result.entryFee).toBe(110);
      expect(result.importerSecurityFiling).toBe(20);
    });

    it('Harbor Maintenance Fee: sin FOB, expone la fórmula real pero NO inventa un monto', async () => {
      const service = makeService(PERU_ROWS);

      const result = await service.resolveSurcharges(TENANT_ID, 'PERU');

      expect(result.harborMaintenanceFee).toBeNull();
      expect(result.harborMaintenanceFeeFormula).toBe('0.125% del FOB');
      expect(result.missing).toContainEqual(expect.stringContaining('falta el valor FOB'));
    });

    it('Harbor Maintenance Fee: con FOB, calcula el monto real a partir de la fórmula', async () => {
      const service = makeService(PERU_ROWS);

      const result = await service.resolveSurcharges(TENANT_ID, 'PERU', 10_000);

      expect(result.harborMaintenanceFee).toBe(12.5);
    });

    it('Destination Charges siempre queda null — no hay ninguna fuente real conocida todavía', async () => {
      const service = makeService(PERU_ROWS);

      const result = await service.resolveSurcharges(TENANT_ID, 'PERU');

      expect(result.destinationCharges).toBeNull();
      expect(result.missing).toContainEqual(expect.stringContaining('Destination Charges'));
    });

    it('país sin ninguna tarifa cargada: todo null, cada uno con su motivo explícito en missing (nunca se fabrica un valor)', async () => {
      const service = makeService([]);

      const result = await service.resolveSurcharges(TENANT_ID, 'ECUADOR');

      expect(result.entryFee).toBeNull();
      expect(result.importerSecurityFiling).toBeNull();
      expect(result.harborMaintenanceFee).toBeNull();
      expect(result.missing.filter((m) => m.includes('ECUADOR'))).toHaveLength(3);
    });
  });

  describe('resolveInlandFreight', () => {
    it('sin destinationPort, no resuelve nada — Oben no expone ese dato por orden todavía', async () => {
      const service = makeService([]);

      const result = await service.resolveInlandFreight(TENANT_ID, 'USA');

      expect(result.inlandFreight).toBeNull();
      expect(result.missing[0]).toContain('puerto/estado de destino');
    });

    it('con destinationPort y tarifa real cargada, devuelve el rate40hc real', async () => {
      const inlandRows = [
        { tenantId: TENANT_ID, country: 'USA', destinationPort: 'Atlanta, GA (Ramp)', rate40hc: 1367 },
      ];
      const service = makeService([], inlandRows);

      const result = await service.resolveInlandFreight(TENANT_ID, 'USA', 'Atlanta, GA (Ramp)');

      expect(result.inlandFreight).toBe(1367);
      expect(result.missing).toEqual([]);
    });

    describe('resolveInlandByAddress (código postal de la dirección que trae Oben)', () => {
      const DALLAS = { tenantId: TENANT_ID, country: 'USA', destinationPort: 'Houston, TX (Port)', destinationAddress: 'Dallas, TX 75212', rate40hc: '1744.00', validUntil: '2026-08-31' };

      it('PF 11366 real: "Dallas TX 75212" → Houston, TX (Port), USD 1744 (texto de Postgres convertido) y avisa que venció', async () => {
        const service = makeService([], [DALLAS]);
        const r = await service.resolveInlandByAddress(TENANT_ID, 'USA', '2144 FRENCH SETTLEMENT RD, Dallas TX 75212, USA DALLAS, TX 75212', new Date('2026-10-01'));
        expect(r).toEqual({ inlandFreight: 1744, forwarder: null, destinationPort: 'Houston, TX (Port)', destinationAddress: 'Dallas, TX 75212', validUntil: '2026-08-31', vencida: true });
      });

      it('PF 11366: Dallas no es puerto de la tabla → sigue saliendo de Houston', async () => {
        const service = makeService([], [DALLAS]);
        const r = await service.resolveInlandByAddress(TENANT_ID, 'USA', 'Dallas TX 75212', new Date('2026-10-01'), 'DALLAS, TX 75212');
        expect(r.destinationPort).toBe('Houston, TX (Port)');
      });

      describe('PF 11237 real (Cincinnati, OH 45240 — reunión del 15-oct)', () => {
        // Filas reales de la tabla de fletes de prod para el ZIP 45240.
        const fila = (forwarder: string, destinationPort: string, rate40hc: string, validUntil: string | null) => ({
          tenantId: TENANT_ID, country: 'USA', forwarder, destinationPort, destinationAddress: 'Cincinnati, OH 45240', rate40hc, validUntil,
        });
        const FILAS_45240 = [
          fila('Shapiro', 'Cincinnati, OH (Ramp)', '523.00', '2026-09-30'),
          fila('Shapiro', 'Columbus, OH (Ramp)', '523.00', null),
          fila('Trading', 'Columbus, OH (Ramp)', '770.00', null),
          fila('Trading', 'Cincinnati, OH (Ramp)', '860.00', null),
          fila('Transborder', 'Cincinnati, OH (Ramp)', '1200.00', null),
        ];

        it('el puerto de arribo de la PF manda: nunca la rampa de Columbus', async () => {
          const service = makeService([], FILAS_45240);
          const sept = await service.resolveInlandByAddress(TENANT_ID, 'USA', 'Cincinnati OH 45240', new Date('2026-09-20'), 'CINCINNATI OH 45240');
          expect(sept).toMatchObject({ forwarder: 'Shapiro', destinationPort: 'Cincinnati, OH (Ramp)', inlandFreight: 523, vencida: false });
          // Vencido el 523 de Shapiro, la vigente más barata DESDE CINCINNATI (no el 523 de Columbus, que llevaba al marítimo de 2900).
          const oct = await service.resolveInlandByAddress(TENANT_ID, 'USA', 'Cincinnati OH 45240', new Date('2026-10-15'), 'CINCINNATI OH 45240');
          expect(oct).toMatchObject({ forwarder: 'Trading', destinationPort: 'Cincinnati, OH (Ramp)', inlandFreight: 860 });
        });

        it('sin puerto de arribo, como antes (la vigente más barata de cualquier puerto)', async () => {
          const service = makeService([], FILAS_45240);
          const r = await service.resolveInlandByAddress(TENANT_ID, 'USA', 'Cincinnati OH 45240', new Date('2026-10-15'));
          expect(r).toMatchObject({ destinationPort: 'Columbus, OH (Ramp)', inlandFreight: 523 });
        });
      });

      it('una tarifa vigente no se marca como vencida', async () => {
        const service = makeService([], [{ ...DALLAS, validUntil: '2026-12-31' }]);
        expect((await service.resolveInlandByAddress(TENANT_ID, 'USA', 'Dallas TX 75212', new Date('2026-10-01'))).vencida).toBe(false);
      });

      it.each([[undefined], [''], ['Dallas TX'], ['Dallas TX 99999']])('sin código postal en la tabla (%j) → null, no se inventa', async (dir) => {
        const service = makeService([], [DALLAS]);
        expect((await service.resolveInlandByAddress(TENANT_ID, 'USA', dir)).inlandFreight).toBeNull();
      });
    });

    it('con destinationPort sin tarifa cargada, null con motivo explícito', async () => {
      const service = makeService([], []);

      const result = await service.resolveInlandFreight(TENANT_ID, 'USA', 'Puerto Inexistente');

      expect(result.inlandFreight).toBeNull();
      expect(result.missing[0]).toContain('Puerto Inexistente');
    });
  });
});

describe('LiquidacionRatesService.resolveOceanFreight (pata 2 del archivo de fletes de octubre 2026)', () => {
  /** Simula el ILIKE de TypeORM: % = comodín, sin distinguir mayúsculas. */
  const like = (op: any) => {
    const pattern = String(op?.value ?? op?._value ?? '');
    const re = pattern
      .replace(/\\([%_])/g, '$1')
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/%/g, '.*');
    return new RegExp(`^${re}$`, 'i');
  };
  const fila = (o: Record<string, unknown>): Record<string, any> => ({
    tenantId: TENANT_ID, origin: 'Cartagena, Colombia (COCTG) - Port', containerType: "FCL 40'", shippingLine: null, ...o,
  });
  const FILAS = [
    fila({ destinationPort: 'Houston, TX (Port)', forwarder: 'Direct', shippingLine: 'Hapag-Lloyd', rateTotal: '941.00', validUntil: '2026-10-30' }),
    fila({ destinationPort: 'Houston, TX (Port)', forwarder: 'Direct', shippingLine: 'Maersk', rateTotal: '1350.00', validUntil: '2026-09-30' }),
    fila({ destinationPort: 'Houston, TX (Port)', forwarder: 'Trading', rateTotal: '900.00', validUntil: '2026-09-30' }),
    fila({ destinationPort: 'Houston, TX (Port)', forwarder: 'Barato', containerType: "FCL 20'", rateTotal: '500.00', validUntil: null }),
    fila({ destinationPort: 'Dallas, TX (Ramp)', forwarder: 'Transborder', shippingLine: 'HAPAG LLOYD', rateTotal: '2500.00', validUntil: '2026-09-30' }),
  ];
  const servicio = (filas = FILAS) => {
    const ocean = {
      find: jest.fn(({ where }: any) =>
        Promise.resolve(
          filas.filter(
            (r) => like(where.origin).test(r.origin) && like(where.destinationPort).test(r.destinationPort) && like(where.containerType).test(r.containerType),
          ),
        ),
      ),
    } as any;
    return new LiquidacionRatesService({ find: jest.fn() } as any, { find: jest.fn() } as any, ocean);
  };
  const HOY = new Date('2026-10-01');

  it('empalma con el puerto del Inland: Cartagena → Houston, la vigente aunque haya una vencida más barata (y nunca la de 20\')', async () => {
    const r = await servicio().resolveOceanFreight(TENANT_ID, 'CARTAGENA - COLOMBIA', 'Houston, TX (Port)', 'DALLAS, TX 75212', HOY);
    expect(r).toEqual({
      flete: 941, origen: 'Cartagena, Colombia (COCTG) - Port', destino: 'Houston, TX (Port)', forwarder: 'Direct', naviera: 'Hapag-Lloyd', validUntil: '2026-10-30', vencida: false,
    });
  });

  it('una tarifa en 0 nunca se sugiere (20-oct: Cartagena → New Orleans de Transborder venía en 0 y sin vencimiento)', async () => {
    const filas = [
      fila({ destinationPort: 'New Orleans, LA (Port)', forwarder: 'Transborder', shippingLine: 'Hapag-Lloyd', rateTotal: '0.00', validUntil: null }),
      fila({ destinationPort: 'New Orleans, LA (Port)', forwarder: 'Shapiro', shippingLine: 'HAPAG LLOYD', rateTotal: '1750.00', validUntil: '2026-10-30' }),
    ];
    const r = await servicio(filas).resolveOceanFreight(TENANT_ID, 'CARTAGENA - COLOMBIA', 'New Orleans, LA (Port)', 'NEW ORLEANS', HOY);
    expect(r).toMatchObject({ flete: 1750, forwarder: 'Shapiro' });
    const solo0 = await servicio([filas[0]]).resolveOceanFreight(TENANT_ID, 'CARTAGENA - COLOMBIA', 'New Orleans, LA (Port)', 'NEW ORLEANS', HOY);
    expect(solo0.flete).toBeNull();
  });

  it('PF 11237: con el Inland desde la rampa de Cincinnati, el marítimo va a Cincinnati (no el 2900 a Columbus)', async () => {
    const filas = [
      fila({ destinationPort: 'Columbus, OH (Ramp)', forwarder: 'Trading', shippingLine: 'HAPAG LLOYD', rateTotal: '2900.00', validUntil: '2026-09-30' }),
      fila({ destinationPort: 'Cincinnati, OH (Ramp)', forwarder: 'Trading', shippingLine: 'HAPAG LLOYD', rateTotal: '3150.00', validUntil: '2026-09-30' }),
      fila({ destinationPort: 'Cincinnati, OH (Ramp)', forwarder: 'Shapiro', shippingLine: 'HAPAG LLOYD', rateTotal: '2804.00', validUntil: '2026-09-30' }),
    ];
    const r = await servicio(filas).resolveOceanFreight(TENANT_ID, 'CARTAGENA - COLOMBIA', 'Cincinnati, OH (Ramp)', 'CINCINNATI', new Date('2026-09-20'));
    expect(r).toMatchObject({ destino: 'Cincinnati, OH (Ramp)', flete: 2804, forwarder: 'Shapiro' });
  });

  it('sin puerto de Inland, usa la ciudad del puerto de arribo de Oben (y avisa si venció)', async () => {
    const r = await servicio().resolveOceanFreight(TENANT_ID, 'CARTAGENA - COLOMBIA', null, 'DALLAS, TX 75212', HOY);
    expect(r).toMatchObject({ flete: 2500, destino: 'Dallas, TX (Ramp)', forwarder: 'Transborder', vencida: true });
  });

  it.each([
    ['otro puerto de embarque sin tarifas', 'BUENAVENTURA - COLOMBIA'],
    ['sin puerto de embarque', null],
  ])('%s → null, no se inventa', async (_caso, embarque) => {
    expect((await servicio().resolveOceanFreight(TENANT_ID, embarque, 'Houston, TX (Port)', 'DALLAS, TX 75212', HOY)).flete).toBeNull();
  });

  it('ciudadDe lee los puertos como los escribe Oben', () => {
    expect(ciudadDe('CARTAGENA - COLOMBIA')).toBe('CARTAGENA');
    expect(ciudadDe('CARTAGENA - CARTAGENA')).toBe('CARTAGENA'); // PF 11237
    expect(ciudadDe('DALLAS, TX 75212')).toBe('DALLAS');
    expect(ciudadDe('CINCINNATI OH 45240')).toBe('CINCINNATI'); // PF 11237, sin coma
    expect(ciudadDe('Cincinnati, OH (Ramp)')).toBe('Cincinnati');
    expect(ciudadDe('Houston, TX, United States (USHOU) - Port')).toBe('Houston');
    expect(ciudadDe('PUERTO GUAYAQUIL')).toBe('GUAYAQUIL');
    expect(ciudadDe('PUERTO RIO GRANDE')).toBe('RIO GRANDE');
    expect(ciudadDe('')).toBeNull();
    expect(ciudadDe(undefined)).toBeNull();
  });
});
