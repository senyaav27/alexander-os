import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));
const sql = await readFile(join(here, 'schema.sql'), 'utf8').catch(() => readFile(join(here, '../src/schema.sql'), 'utf8'));
await pool.query(sql);
await pool.end();
console.log('Alexander AI database is ready.');

