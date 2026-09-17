import pg from 'pg';
import { config } from './config.js';

export function databaseSslOptions(url:string,mode:string) {
  if(mode==='render-internal') {
    if(!/^dpg-[a-z0-9-]+$/.test(new URL(url).hostname)) throw new Error('render-internal TLS is restricted to a Render private database hostname');
    return {rejectUnauthorized:false}; // Render private endpoints use self-signed certificates.
  }
  return mode==='true'?{rejectUnauthorized:true}:undefined;
}
export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  ssl: databaseSslOptions(config.DATABASE_URL,config.DATABASE_SSL),
  max: 8, connectionTimeoutMillis: 5000, statement_timeout: 15000
});

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

