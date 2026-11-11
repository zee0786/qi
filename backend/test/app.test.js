import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';

const USERS = {
  1: { id: 1, name: 'Priya Singh', role: 'quality_engineer' },
  2: { id: 2, name: 'Arjun Mehta', role: 'production_supervisor' },
};
const calls = { classify: 0, createInspection: 0 };

const repo = {
  getUser: async (id) => USERS[id] ?? null,
  listUsers: async () => Object.values(USERS),
  listBatches: async () => [],
  getBatch: async (id) => (id === 'BATCH-001' ? { id } : null),
  getPrediction: async () => null,
  createInspection: async () => {
    calls.createInspection += 1;
    return 1;
  },
  listInspections: async () => [],
  getKpiCounts: async () => ({ total: 0, rejected: 0, aiAssessed: 0, aiAccepted: 0, byType: {} }),
};
const classifier = {
  model: 'stub',
  classify: async () => {
    calls.classify += 1;
    return { predicted: 'Dent', confidence: 0.8, raw: {} };
  },
};

let server;
let base;
before(async () => {
  server = createApp({ repo, classifier, uploadDir: '/tmp/qi-test-uploads' }).listen(0);
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

const call = (path, { user, method = 'GET', body } = {}) =>
  fetch(base + path, {
    method,
    headers: { ...(user ? { 'x-user-id': String(user) } : {}), 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

test('requests without a known user are rejected with 401', async () => {
  assert.equal((await call('/api/inspections')).status, 401);
  assert.equal((await call('/api/inspections', { user: 99 })).status, 401);
});

test('a Production Supervisor cannot upload a photo for classification', async () => {
  const res = await call('/api/classify', { user: 2, method: 'POST' });
  assert.equal(res.status, 403);
  assert.equal(calls.classify, 0, 'the AI must not be called for a forbidden request');
});

test('a Production Supervisor cannot log an inspection', async () => {
  const body = { batchId: 'BATCH-001', predictionId: 1, finalDefectType: 'Dent' };
  const res = await call('/api/inspections', { user: 2, method: 'POST', body });
  assert.equal(res.status, 403);
  assert.equal(calls.createInspection, 0);
});

test('a Production Supervisor can read the list and the dashboard', async () => {
  assert.equal((await call('/api/inspections', { user: 2 })).status, 200);
  assert.equal((await call('/api/dashboard', { user: 2 })).status, 200);
});

test('a Quality Engineer gets validation errors, not 403', async () => {
  const noPhoto = await call('/api/classify', { user: 1, method: 'POST' });
  assert.equal(noPhoto.status, 400);
  const badBatch = await call('/api/inspections', {
    user: 1,
    method: 'POST',
    body: { batchId: 'NOPE', predictionId: 1, finalDefectType: 'Dent' },
  });
  assert.equal(badBatch.status, 400);
});

test('the list filter rejects unsupported defect types', async () => {
  assert.equal((await call('/api/inspections?defectType=Crack', { user: 2 })).status, 400);
  assert.equal((await call('/api/inspections?defectType=Dent', { user: 2 })).status, 200);
});
