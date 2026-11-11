import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { AiOutputError } from './aiClassifier.js';
import { ROLES, authenticate, requireRole } from './auth.js';
import { HttpError } from './errors.js';
import { buildInspectionRecord } from './inspectionService.js';
import { computeKpis } from './kpi.js';
import { ALL_OUTCOMES, normalizeOutcome } from './taxonomy.js';

const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) =>
    IMAGE_TYPES[file.mimetype]
      ? cb(null, true)
      : cb(new HttpError(400, 'Photo must be a JPEG, PNG or WebP image')),
});

export function createApp({ repo, classifier, uploadDir }) {
  const app = express();
  const auth = authenticate(repo);
  const onlyEngineers = requireRole(ROLES.QUALITY_ENGINEER);

  app.use(cors());
  app.use(express.json());
  app.use('/uploads', express.static(uploadDir));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/users', async (_req, res) => res.json(await repo.listUsers()));
  app.get('/api/batches', auth, async (_req, res) => res.json(await repo.listBatches()));

  // Step 2a: upload + AI suggestion. Nothing is recorded as an inspection yet.
  app.post('/api/classify', auth, onlyEngineers, upload.single('image'), async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Attach a photo in the "image" field');

    const filename = `${randomUUID()}${IMAGE_TYPES[req.file.mimetype]}`;
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, filename), req.file.buffer);
    const imageRef = `/uploads/${filename}`;

    let outcome;
    try {
      const result = await classifier.classify({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
      });
      outcome = { status: 'ok', ...result, errorMessage: null };
    } catch (err) {
      console.error('AI classification failed:', err.message);
      outcome = {
        status: err instanceof AiOutputError ? 'unusable' : 'failed',
        predicted: null,
        confidence: null,
        raw: err instanceof AiOutputError ? err.raw : null,
        errorMessage: err.message,
      };
    }

    const prediction = await repo.createPrediction({
      imageRef,
      model: classifier.model,
      createdBy: req.user.id,
      ...outcome,
    });

    res.status(201).json({
      predictionId: prediction.id,
      imageRef,
      status: outcome.status,
      predictedDefectType: outcome.predicted,
      confidence: outcome.confidence,
    });
  });

  // Step 2b: the engineer's confirmation. was_overridden is derived server-side.
  app.post('/api/inspections', auth, onlyEngineers, async (req, res) => {
    const { batchId, predictionId, finalDefectType, comments } = req.body ?? {};

    if (!(await repo.getBatch(batchId))) throw new HttpError(400, 'Unknown batchId');
    const prediction = Number.isInteger(predictionId)
      ? await repo.getPrediction(predictionId)
      : null;
    if (!prediction) throw new HttpError(400, 'Unknown predictionId');
    if (prediction.created_by !== req.user.id) {
      throw new HttpError(403, 'This photo was analysed by another inspector');
    }

    const record = buildInspectionRecord({
      batchId,
      prediction,
      finalDefectType,
      comments,
      inspectorId: req.user.id,
    });

    try {
      const id = await repo.createInspection(record);
      res.status(201).json({ id, wasOverridden: record.wasOverridden });
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'This photo has already been logged');
      throw err;
    }
  });

  app.get('/api/inspections', auth, async (req, res) => {
    const { defectType, batchId } = req.query;
    let filter;
    if (defectType !== undefined && defectType !== '') {
      filter = normalizeOutcome(defectType);
      if (!filter)
        throw new HttpError(400, `defectType must be one of: ${ALL_OUTCOMES.join(', ')}`);
    }
    res.json(await repo.listInspections({ defectType: filter, batchId: batchId || undefined }));
  });

  app.get('/api/dashboard', auth, async (req, res) => {
    res.json(computeKpis(await repo.getKpiCounts(req.query.batchId || undefined)));
  });

  // Express identifies error handlers by their four-argument signature.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Photo must be 5 MB or smaller' });
    }
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server' });
  });

  return app;
}
