import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, withTransaction } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));
const sql = await readFile(join(here, 'schema.sql'), 'utf8').catch(() => readFile(join(here, '../src/schema.sql'), 'utf8'));
await withTransaction(async client=>{await client.query('SELECT pg_advisory_xact_lock(41000)');await client.query(sql);});
await pool.end();
console.log('Alexander AI database is ready.');

