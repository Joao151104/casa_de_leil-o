import pg from 'pg';
import { config } from '../config.js';

// BIGINT (int8) chega como string por padrão. Todos os valores monetários são centavos
// muito abaixo de 2^53, então convertê-los para number é seguro.
pg.types.setTypeParser(20, (value) => Number(value));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

export type Db = pg.Pool | pg.PoolClient;

/** Executa `fn` dentro de uma transação, com ROLLBACK automático em caso de erro. */
export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
