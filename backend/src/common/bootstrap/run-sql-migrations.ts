import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Aplica los archivos SQL de migración en orden lexicográfico ANTES de que TypeORM
 * ejecute synchronize. Registra las aplicadas en tabla schema_migrations para no re-aplicar.
 *
 * Cada archivo debe ser idempotente para permitir corridas parciales.
 */
// Tipado local mínimo para el driver `pg` sin instalar @types/pg.
interface PgClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(text: string, values?: unknown[]): Promise<{ rowCount: number | null }>;
}

export async function runSqlMigrations(): Promise<void> {
  const migrationsDir = path.resolve(__dirname, '../../../migrations');

  let files: string[];
  try {
    files = (await fs.readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch {
    console.warn('[migrations] carpeta ausente:', migrationsDir);
    return;
  }
  if (files.length === 0) return;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = require('pg') as {
    Client: new (opts: Record<string, unknown>) => PgClient;
  };
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'dta',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'dta_db',
  });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    for (const file of files) {
      const already = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file],
      );
      if ((already.rowCount ?? 0) > 0) continue;

      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf-8');
      console.log(`[migrations] aplicando ${file}...`);
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file],
      );
      console.log(`[migrations] aplicada ${file}`);
    }
  } finally {
    await client.end();
  }
}
