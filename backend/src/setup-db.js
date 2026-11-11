import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createPool } from './db.js';

const pool = createPool(process.env.DATABASE_URL);
try {
  for (const file of ['schema.sql', 'seed.sql']) {
    await pool.query(await readFile(new URL(file, import.meta.url), 'utf8'));
  }
  console.log('Database schema and seed data are ready.');
} finally {
  await pool.end();
}
