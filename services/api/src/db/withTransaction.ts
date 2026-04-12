import type { Pool, PoolClient } from 'pg';

/**
 * Runs `fn` inside a single database transaction.
 * Automatically commits on success and rolls back on error.
 * The client is always released back to the pool.
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore rollback error */
    }
    throw e;
  } finally {
    client.release();
  }
}
