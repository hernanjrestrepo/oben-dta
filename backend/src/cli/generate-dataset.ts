import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { DatasetGeneratorService } from '../modules/dataset/dataset-generator.service';
import { TenantsService } from '../modules/tenants/tenants.service';
import { DatasetPreset } from '../modules/dataset/dto/generate-dataset.dto';

/**
 * CLI para generar el dataset semilla de un tenant.
 *
 * Uso:
 *   npm run dataset:generate -- --tenant=oben --preset=full --seed=42
 *   npm run dataset:generate -- --tenant=oben --preset=small --reset
 *   npm run dataset:generate -- --tenant=oben --clients=1000 --products=8000 --orders=30000
 *
 * --tenant acepta el slug del tenant (ej. "oben"), se resuelve a su UUID internamente.
 * --reset borra ÚNICAMENTE los datos de ESE tenant antes de generar (acción destructiva,
 * nunca toca otros tenants).
 */
function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) out[m[1]] = m[2] ?? 'true';
  }
  return out;
}

async function run() {
  const logger = new Logger('DatasetCLI');
  const args = parseArgs(process.argv.slice(2));

  if (!args.tenant) {
    logger.error('Falta --tenant=<slug>. Ejemplo: npm run dataset:generate -- --tenant=oben');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  try {
    const tenants = app.get(TenantsService);
    const generator = app.get(DatasetGeneratorService);

    const tenant = await tenants.findBySlug(args.tenant);
    if (!tenant) {
      logger.error(`Tenant '${args.tenant}' no existe.`);
      process.exit(1);
      return;
    }

    const preset = (args.preset as DatasetPreset) ?? undefined;
    const summary = await generator.generate({
      tenantId: tenant.id,
      seed: args.seed ? Number(args.seed) : undefined,
      preset,
      clients: args.clients ? Number(args.clients) : undefined,
      products: args.products ? Number(args.products) : undefined,
      orders: args.orders ? Number(args.orders) : undefined,
      reset: args.reset === 'true',
    });

    logger.log(`Dataset generado para '${args.tenant}': ${JSON.stringify(summary, null, 2)}`);
    await app.close();
  } catch (error) {
    logger.error('Error generando dataset', (error as Error).stack);
    await app.close();
    process.exit(1);
  }
}

run();
