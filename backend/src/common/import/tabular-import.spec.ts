import * as XLSX from 'xlsx';
import { normalizeHeader, parseBool, parseDomains, pick, readTabular } from './tabular-import';

function xlsxBase64(rows: Record<string, unknown>[]): string {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Hoja1');
  return (XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer).toString('base64');
}

describe('tabular-import (carga de maestros desde Excel/CSV)', () => {
  it('reconoce columnas sin importar mayúsculas, tildes ni espacios', () => {
    expect(normalizeHeader('Código  Cliente')).toBe('codigocliente');
    const [row] = readTabular({ rows: [{ 'Código Oben': ' SC15TN ', 'Descripción': 'BOPP' }] });
    expect(pick(row, 'codigo oben')).toBe('SC15TN');
    expect(pick(row, 'no existe', 'descripcion')).toBe('BOPP');
  });

  it('lee un Excel real (.xlsx en base64), primera hoja', () => {
    const rows = readTabular({
      fileBase64: xlsxBase64([{ Cliente: 'SIM-CLI-01', 'Código del cliente': 'BOPP 1', 'Código Oben': 'SC15TN' }]),
      filename: 'equivalencias.xlsx',
    });
    expect(rows).toEqual([{ cliente: 'SIM-CLI-01', codigodelcliente: 'BOPP 1', codigooben: 'SC15TN' }]);
  });

  it('lee un CSV', () => {
    const csv = 'Cliente,Codigo del cliente,Codigo Oben\nSIM-CLI-01,BOPP 345,SC15TN\n';
    const rows = readTabular({ fileBase64: Buffer.from(csv).toString('base64'), filename: 'eq.csv' });
    expect(pick(rows[0], 'codigo del cliente')).toBe('BOPP 345');
  });

  it('rechaza una carga vacía o sin datos', () => {
    expect(() => readTabular({})).toThrow(/rows.*fileBase64/);
    expect(() => readTabular({ rows: [] })).toThrow();
  });

  it('dominios: normaliza, quita @ y duplicados, y rechaza lo que no es un dominio', () => {
    expect(parseDomains('Cliente.com; @otro.co, cliente.com')).toEqual(['cliente.com', 'otro.co']);
    expect(() => parseDomains('no es dominio')).toThrow(/no es un dominio/);
    expect(parseDomains(undefined)).toEqual([]);
  });

  it('sí/no en español e inglés; cualquier otra cosa es null (no se adivina)', () => {
    expect(parseBool('Sí')).toBe(true);
    expect(parseBool('no')).toBe(false);
    expect(parseBool('quizás')).toBeNull();
  });
});
