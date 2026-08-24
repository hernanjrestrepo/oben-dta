import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { FreightRateImportService } from '../modules/freight-rates/freight-rate-import.service';

/**
 * Carga manual del maestro de tarifas de flete desde un archivo Excel
 * (el mismo camino que usa el conector IMAP cuando detecta un correo
 * clasificado como `freight_rates` — ver ImapConnectorService). Útil para
 * cargar un archivo que llegó antes de que el conector real estuviera
 * activo, o para forzar una recarga manual.
 *
 * Uso:
 *   npm run freight:import -- --file="ruta/al/archivo.xlsx" --tenantId=<uuid>
 */
function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) out[m[1]] = m[2] ?? 'true';
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file || !args.tenantId) {
    console.error('Uso: npm run freight:import -- --file="ruta.xlsx" --tenantId=<uuid>');
    process.exit(1);
  }

  const buffer = fs.readFileSync(args.file);
  const sourceFile = args.file.split(/[\\/]/).pop() ?? args.file;

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const service = app.get(FreightRateImportService);

  const parsed = service.parseWorkbook(buffer);
  console.log(`Parseado: ${parsed.inland.length} inland, ${parsed.transload.length} transload, ${parsed.surcharges.length} recargos.`);

  const result = await service.replaceAll(args.tenantId, sourceFile, parsed);
  console.log('Cargado en la base de datos:', JSON.stringify(result, null, 2));

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
