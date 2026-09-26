import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { createPool } from './pool.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(existing?: pg.Pool): Promise<void> {
  const pool = existing ?? createPool();
  const own = !existing;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const dir = join(__dirname, 'migrations');
    const files = readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
    for (const file of files) {
      const done = await pool.query('SELECT 1 FROM schema_migrations WHERE id = $1', [file]);
      if (done.rowCount) continue;
      const sql = readFileSync(join(dir, file), 'utf8');
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
    }
  } finally {
    if (own) await pool.end();
  }
}

const invoked = process.argv[1]?.includes('migrate');
if (invoked) {
  runMigrations()
    .then(() => {
      console.log('Migrations completed');
    })
    .catch((err: unknown) => {
      console.error('Migration failed');
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
