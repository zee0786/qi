import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildInspectionRecord, computeOverride } from '../src/inspectionService.js';

const okPrediction = {
  id: 7,
  status: 'ok',
  image_ref: '/uploads/a.jpg',
  predicted_defect_type: 'Dent',
  confidence: '0.830',
};
const base = { batchId: 'BATCH-001', inspectorId: 1 };

test('computeOverride is true only when the AI answered and the human disagreed', () => {
  assert.equal(computeOverride('Dent', 'Dent'), false);
  assert.equal(computeOverride('Dent', 'Paint Issue'), true);
  assert.equal(computeOverride('No Defect', 'Scratch'), true);
  assert.equal(computeOverride(null, 'Scratch'), false);
});

test('accepting the AI prediction records no override', () => {
  const record = buildInspectionRecord({
    ...base,
    prediction: okPrediction,
    finalDefectType: 'Dent',
  });
  assert.equal(record.wasOverridden, false);
  assert.equal(record.aiPredictedDefectType, 'Dent');
  assert.equal(record.finalDefectType, 'Dent');
});

test('overriding keeps both the AI answer and the final answer', () => {
  const record = buildInspectionRecord({
    ...base,
    prediction: okPrediction,
    finalDefectType: 'paint issue',
    comments: '  Discoloration near the mounting hole  ',
  });
  assert.equal(record.wasOverridden, true);
  assert.equal(record.aiPredictedDefectType, 'Dent');
  assert.equal(record.aiConfidence, '0.830');
  assert.equal(record.finalDefectType, 'Paint Issue');
  assert.equal(record.comments, 'Discoloration near the mounting hole');
});

test('overriding to "No Defect" counts as an override', () => {
  const record = buildInspectionRecord({
    ...base,
    prediction: okPrediction,
    finalDefectType: 'No Defect',
  });
  assert.equal(record.wasOverridden, true);
});

test('when the AI failed there is no AI answer and no override', () => {
  const failed = {
    id: 8,
    status: 'failed',
    image_ref: '/uploads/b.jpg',
    predicted_defect_type: null,
  };
  const record = buildInspectionRecord({ ...base, prediction: failed, finalDefectType: 'Scratch' });
  assert.equal(record.aiPredictedDefectType, null);
  assert.equal(record.aiConfidence, null);
  assert.equal(record.wasOverridden, false);
});

test('rejects unsupported final types and over-long comments', () => {
  assert.throws(
    () => buildInspectionRecord({ ...base, prediction: okPrediction, finalDefectType: 'Crack' }),
    { status: 400 },
  );
  assert.throws(
    () =>
      buildInspectionRecord({
        ...base,
        prediction: okPrediction,
        finalDefectType: 'Dent',
        comments: 'x'.repeat(1001),
      }),
    { status: 400 },
  );
});
