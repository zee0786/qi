import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AiOutputError, createClassifier, extractPrediction } from '../src/aiClassifier.js';

const toolResponse = (input) => ({ content: [{ type: 'tool_use', name: 'report_defect', input }] });

test('extractPrediction reads a valid tool call', () => {
  const result = extractPrediction(
    toolResponse({ predicted_defect_type: 'Dent', confidence: 0.83 }),
  );
  assert.equal(result.predicted, 'Dent');
  assert.equal(result.confidence, 0.83);
});

test('extractPrediction normalizes odd casing and drops an invalid confidence', () => {
  const result = extractPrediction(
    toolResponse({ predicted_defect_type: 'paint issue', confidence: 9 }),
  );
  assert.equal(result.predicted, 'Paint Issue');
  assert.equal(result.confidence, null);
});

test('extractPrediction falls back to JSON in a text block, including code fences', () => {
  const text = '```json\n{"predicted_defect_type":"Scratch","confidence":0.5}\n```';
  const result = extractPrediction({ content: [{ type: 'text', text }] });
  assert.equal(result.predicted, 'Scratch');
});

test('extractPrediction rejects unsupported categories, free text and empty responses', () => {
  assert.throws(
    () => extractPrediction(toolResponse({ predicted_defect_type: 'Crack', confidence: 0.9 })),
    AiOutputError,
  );
  assert.throws(
    () => extractPrediction({ content: [{ type: 'text', text: 'Looks like a dent to me' }] }),
    AiOutputError,
  );
  assert.throws(() => extractPrediction({ content: [] }), AiOutputError);
  assert.throws(() => extractPrediction(undefined), AiOutputError);
});

test('classify sends the image to the model and validates the answer', async () => {
  let sent;
  const client = {
    messages: {
      create: async (params) => {
        sent = params;
        return toolResponse({ predicted_defect_type: 'No Defect', confidence: 0.95 });
      },
    },
  };
  const classifier = createClassifier({ client, model: 'test-model' });
  const result = await classifier.classify({ buffer: Buffer.from('abc'), mimeType: 'image/png' });

  assert.equal(result.predicted, 'No Defect');
  assert.equal(sent.model, 'test-model');
  assert.equal(sent.messages[0].content[0].source.media_type, 'image/png');
});

test('classify without an API key fails clearly instead of guessing', async () => {
  const classifier = createClassifier({ model: 'test-model' });
  await assert.rejects(
    classifier.classify({ buffer: Buffer.from('x'), mimeType: 'image/png' }),
    /ANTHROPIC_API_KEY/,
  );
});
