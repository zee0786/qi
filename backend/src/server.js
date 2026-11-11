import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createClassifier } from './aiClassifier.js';
import { createPool } from './db.js';
import { createRepo } from './repo.js';

const uploadDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads');

const classifier = createClassifier({
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 30000,
});

const app = createApp({
  repo: createRepo(createPool(process.env.DATABASE_URL)),
  classifier,
  uploadDir,
});
const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
