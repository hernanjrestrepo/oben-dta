import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';

/**
 * Diagnostico puntual: usa el propio SchemaBuilder de TypeORM (el mismo que
 * usaria `synchronize: true`) en modo LOG, no EJECUCION - lista exactamente
 * las diferencias entre las entidades reales del codigo y el esquema fisico
 * de la base conectada, sin tocar nada. Encontrado en vivo el 2026-08-26:
 * varias tablas/columnas fisicas en el servidor de produccion no coinciden
 * con las entidades (createdAt vs created_at, columnas faltantes, tablas
 * faltantes) porque production corre con synchronize:false y no toda
 * migracion se escribio a tiempo.
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const dataSource = app.get<DataSource>(getDataSourceToken());
  const sqlInMemory = await dataSource.driver.createSchemaBuilder().log();
  console.log(`--- ${sqlInMemory.upQueries.length} cambios pendientes ---`);
  for (const q of sqlInMemory.upQueries) {
    console.log(q.query);
  }
  await app.close();
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
