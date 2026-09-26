import pg from 'pg';

export function createPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }
  const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
  return new pg.Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl,
  });
}
