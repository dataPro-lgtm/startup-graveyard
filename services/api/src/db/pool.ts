import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null | undefined;

export function getPool(): pg.Pool | null {
  if (pool !== undefined) return pool;
  const url = process.env.DATABASE_URL;
  pool = url ? new Pool({ connectionString: url }) : null;
  return pool;
}

export async function resetPool(): Promise<void> {
  const current = pool;
  pool = undefined;
  if (current) {
    await current.end();
  }
}
