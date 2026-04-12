import pg from 'pg';
import type { Pool } from 'pg';

const { Pool: PgPool } = pg;

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function getRequiredTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL?.trim();
  if (!url) {
    throw new Error('TEST_DATABASE_URL is required for PostgreSQL integration tests.');
  }
  return url;
}

export function createTestPool(): Pool {
  return new PgPool({ connectionString: getRequiredTestDatabaseUrl() });
}

export async function truncatePublicTables(pool: Pool): Promise<void> {
  const res = await pool.query<{ tablename: string }>(
    `
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
    `,
  );
  const tables = res.rows.map((row) => quoteIdent(row.tablename));
  if (tables.length === 0) return;
  await pool.query(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
}
