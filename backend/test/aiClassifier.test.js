import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AiOutputError, createClassifier, extractPrediction } from '../src/aiClassifier.js';

const geminiText = (text) => ({ candidates: [{ content: { parts: [{ text }] } }] });
const geminiJson = (obj) => geminiText(JSON.stringify(obj));
const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });
const errResponse = (status) => ({ ok: false, status, json: async () => ({}) });

test('extractPrediction reads a valid JSON answer', () => {
  const result = extractPrediction(geminiJson({ predicted_defect_type: 'Dent', confidence: 0.83 }));
  assert.equal(result.predicted, 'Dent');
  assert.equal(result.confidence, 0.83);
});

test('extractPrediction normalizes odd casing and drops an invalid confidence', () => {
  const result = extractPrediction(
    geminiJson({ predicted_defect_type: 'paint issue', confidence: 9 }),
  );
  assert.equal(result.predicted, 'Paint Issue');
  assert.equal(result.confidence, null);
});

test('extractPrediction tolerates JSON wrapped in code fences', () => {
  const text = '```json\n{"predicted_defect_type":"Scratch","confidence":0.5}\n```';
  assert.equal(extractPrediction(geminiText(text)).predicted, 'Scratch');
});

test('extractPrediction rejects unsupported categories, free text and empty responses', () => {
  assert.throws(
    () => extractPrediction(geminiJson({ predicted_defect_type: 'Crack', confidence: 0.9 })),
    AiOutputError,
  );
  assert.throws(() => extractPrediction(geminiText('Looks like a dent to me')), AiOutputError);
  assert.throws(() => extractPrediction(geminiText('[1, 2]')), AiOutputError);
  assert.throws(() => extractPrediction({ candidates: [] }), AiOutputError);
  assert.throws(() => extractPrediction(undefined), AiOutputError);
});

test('extractPrediction reports a blocked prompt as unusable output', () => {
  assert.throws(() => extractPrediction({ promptFeedback: { blockReason: 'SAFETY' } }), /SAFETY/);
});

test('classify sends the image and key to Gemini and validates the answer', async () => {
  let call;
  const fetchImpl = async (url, init) => {
    call = { url, init, body: JSON.parse(init.body) };
    return okResponse(geminiJson({ predicted_defect_type: 'No Defect', confidence: 0.95 }));
  };
  const classifier = createClassifier({ apiKey: 'k', model: 'test-model', fetchImpl });
  const result = await classifier.classify({ buffer: Buffer.from('abc'), mimeType: 'image/png' });

  assert.equal(result.predicted, 'No Defect');
  assert.match(call.url, /models\/test-model:generateContent$/);
  assert.equal(call.init.headers['x-goog-api-key'], 'k');
  assert.equal(call.body.contents[0].parts[0].inline_data.mime_type, 'image/png');
  assert.equal(
    call.body.contents[0].parts[0].inline_data.data,
    Buffer.from('abc').toString('base64'),
  );
});

test('classify retries a rate-limited request and then succeeds', async () => {
  const answers = [
    errResponse(429),
    okResponse(geminiJson({ predicted_defect_type: 'Scratch', confidence: 0.6 })),
  ];
  const classifier = createClassifier({
    apiKey: 'k',
    model: 'm',
    retryDelayMs: 0,
    fetchImpl: async () => answers.shift(),
  });
  const result = await classifier.classify({ buffer: Buffer.from('x'), mimeType: 'image/png' });
  assert.equal(result.predicted, 'Scratch');
  assert.equal(answers.length, 0);
});

test('classify gives up after the retry budget and does not leak the key', async () => {
  let calls = 0;
  const classifier = createClassifier({
    apiKey: 'secret-key',
    model: 'm',
    maxRetries: 2,
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return errResponse(503);
    },
  });
  await assert.rejects(
    classifier.classify({ buffer: Buffer.from('x'), mimeType: 'image/png' }),
    (err) => /503/.test(err.message) && !err.message.includes('secret-key'),
  );
  assert.equal(calls, 3);
});

test('classify does not retry client errors such as an invalid key', async () => {
  let calls = 0;
  const classifier = createClassifier({
    apiKey: 'bad',
    model: 'm',
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return errResponse(400);
    },
  });
  await assert.rejects(
    classifier.classify({ buffer: Buffer.from('x'), mimeType: 'image/png' }),
    /400/,
  );
  assert.equal(calls, 1);
});

test('classify without an API key fails clearly instead of guessing', async () => {
  const classifier = createClassifier({
    model: 'm',
    fetchImpl: async () => assert.fail('no call'),
  });
  await assert.rejects(
    classifier.classify({ buffer: Buffer.from('x'), mimeType: 'image/png' }),
    /GEMINI_API_KEY/,
  );
});
