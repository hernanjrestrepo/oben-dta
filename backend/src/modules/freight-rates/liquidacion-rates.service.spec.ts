import { LiquidacionRatesService } from './liquidacion-rates.service';

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

      expect(result).toMatchObject({ entryFee: 110, importerSecurityFiling: 20, harborMaintenanceFee: 9.7342 });
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
        expect(r).toEqual({ inlandFreight: 1744, destinationPort: 'Houston, TX (Port)', destinationAddress: 'Dallas, TX 75212', validUntil: '2026-08-31', vencida: true });
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
