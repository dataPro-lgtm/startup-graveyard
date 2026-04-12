import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null | undefined;

export function getPool(): pg.Pool | null {
  if (pool !== undefined) return pool;
  const url = process.env.DATABASE_URL;
  pool = url ? new Pool({ connectionString: url }) : null;
  return pool;
}
