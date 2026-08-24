import * as XLSX from 'xlsx';
import { FreightRateImportService } from './freight-rate-import.service';

/** Construye un workbook sintético con la misma forma que el real de Oben. */
function buildWorkbook(): Buffer {
  const wb = XLSX.utils.book_new();

  const inland = XLSX.utils.aoa_to_sheet([
    ['Freight Forwarder ', '3. Destination Port / Ramp', 'State', '3. Destination Address', 'Weight\n(Lbs)', "Total 40'HC", 'Transit Time\n(days)', 'Validity'],
    ['Shapiro', 'Atlanta, GA (Ramp)', 'Alabama', 'Birmingham, AL 35234', 54000, 1367, null, new Date(2026, 7, 31)],
    ['Shapiro', 'New Orleans, LA (Port)', 'Alabama', 'Birmingham, AL 35235', 54000, 2880, null, new Date(2026, 7, 31)],
    // Fila de disclaimer legal pegada en la misma columna (caso real) — debe descartarse.
    ['This message is intended only for the use of the individual...', null, null, null, null, null, null, null],
  ]);
  XLSX.utils.book_append_sheet(wb, inland, 'Inland');

  const canada = XLSX.utils.aoa_to_sheet([
    ['Freight Forwarder ', '3. Destination Port / Ramp', 'State', '3. Destination Address', 'Weight\n(Lbs)', "Total 40'HC", 'Transit Time\n(days)', 'Validity'],
    ['Shapiro', 'Winnipeg, MB (Ramp)', 'Manitoba', 'Winnipeg, MB', 54900, 770, null, new Date(2026, 5, 30)],
  ]);
  XLSX.utils.book_append_sheet(wb, canada, 'Canada');

  const transload = XLSX.utils.aoa_to_sheet([
    ['Destination Port', 'Warehouse', 'Delivery Address', 'Unit Type', 'Transloading Rate', 'Transportation Rate', 'Validity'],
    ['New York, NY (Port)', null, 'Bloomington, MN 55437', 44000, 1000, 3075, 'one week'],
    [null, null, 'St. Paul, MN 55110', 44000, 1000, 3075, 'one week'],
  ]);
  XLSX.utils.book_append_sheet(wb, transload, 'Transload');

  const surcharges = XLSX.utils.aoa_to_sheet([
    ['Surcharge / Extra charge', 'Rate'],
    ['Peru :', null],
    ['Only Inland ( Shapiro)', null],
    ['Importer Security Filing', 20],
    ['Entry Fee', 110],
    ['Harbor Maintenance Fee', '0.125% del FOB'],
    [null, null],
    ['Colombia :', null],
    ['Ocean+ Inland (Shapiro)', null],
    ['Importer Security Filing', 20],
  ]);
  XLSX.utils.book_append_sheet(wb, surcharges, 'Destination Surcharges');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('FreightRateImportService (maestro de fletes, WO-018)', () => {
  let service: FreightRateImportService;

  beforeEach(() => {
    service = new FreightRateImportService(
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );
  });

  describe('parseWorkbook', () => {
    it('parsea Inland (USA) descartando filas que no son del forwarder conocido (disclaimer legal)', () => {
      const parsed = service.parseWorkbook(buildWorkbook());
      const usa = parsed.inland.filter((r) => r.country === 'USA');
      expect(usa).toHaveLength(2);
      expect(usa[0]).toMatchObject({
        forwarder: 'Shapiro',
        destinationPort: 'Atlanta, GA (Ramp)',
        state: 'Alabama',
        rate40hc: 1367,
        validUntil: '2026-08-31',
      });
    });

    it('parsea Canada como país separado', () => {
      const parsed = service.parseWorkbook(buildWorkbook());
      const ca = parsed.inland.filter((r) => r.country === 'CA');
      expect(ca).toHaveLength(1);
      expect(ca[0].destinationPort).toBe('Winnipeg, MB (Ramp)');
    });

    it('parsea Transload', () => {
      const parsed = service.parseWorkbook(buildWorkbook());
      expect(parsed.transload).toHaveLength(2);
      expect(parsed.transload[0]).toMatchObject({
        deliveryAddress: 'Bloomington, MN 55437',
        transloadingRate: 1000,
        transportationRate: 3075,
      });
    });

    it('parsea recargos por país, separa monto fijo de fórmula, y no arrastra el ":" del encabezado', () => {
      const parsed = service.parseWorkbook(buildWorkbook());
      expect(parsed.surcharges).toHaveLength(4);
      expect(parsed.surcharges.filter((s) => s.country === 'Peru')).toHaveLength(3);
      expect(parsed.surcharges.filter((s) => s.country === 'Colombia')).toHaveLength(1);
      const harborFee = parsed.surcharges.find((s) => s.surchargeName === 'Harbor Maintenance Fee');
      expect(harborFee).toMatchObject({ rateAmount: null, rateFormula: '0.125% del FOB' });
    });
  });

  describe('replaceAll', () => {
    it('borra el maestro anterior del tenant e inserta el nuevo dentro de una sola transacción', async () => {
      const deleteCalls: unknown[] = [];
      const insertCalls: unknown[] = [];
      const manager = {
        delete: jest.fn(async (...args: unknown[]) => deleteCalls.push(args)),
        insert: jest.fn(async (...args: unknown[]) => insertCalls.push(args)),
      };
      const dataSource = {
        transaction: jest.fn(async (fn: (m: unknown) => Promise<void>) => fn(manager)),
      };

      const svc = new FreightRateImportService(
        dataSource as never,
        undefined as never,
        undefined as never,
        undefined as never,
      );

      const result = await svc.replaceAll('tenant-1', 'rates.xlsx', {
        inland: [{ country: 'USA', forwarder: 'Shapiro', destinationPort: 'X', state: 'Y', destinationAddress: 'Z', weightLbs: 1, rate40hc: 100, transitTimeDays: null, validUntil: null }],
        transload: [],
        surcharges: [],
      });

      expect(deleteCalls).toHaveLength(3);
      expect(insertCalls).toHaveLength(1);
      expect(result).toMatchObject({ sourceFile: 'rates.xlsx', inlandCount: 1, transloadCount: 0, surchargeCount: 0 });
    });
  });
});
