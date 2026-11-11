import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeKpis } from '../src/kpi.js';

test('matches the worked example from the brief', () => {
  const kpis = computeKpis({
    total: 10,
    rejected: 4,
    aiAssessed: 10,
    aiAccepted: 8,
    byType: { Scratch: 1, Dent: 2, 'Paint Issue': 1 },
  });
  assert.equal(kpis.totalInspected, 10);
  assert.equal(kpis.passed, 6);
  assert.equal(kpis.rejected, 4);
  assert.equal(kpis.defectRate, 40);
  assert.equal(kpis.aiAcceptanceRate, 80);
  assert.deepEqual(kpis.defectBreakdown, [
    { defectType: 'Scratch', count: 1 },
    { defectType: 'Dent', count: 2 },
    { defectType: 'Paint Issue', count: 1 },
    { defectType: 'Missing Component', count: 0 },
  ]);
});

test('rates are null (not 0 or NaN) when there is nothing to divide by', () => {
  const kpis = computeKpis({ total: 0, rejected: 0, aiAssessed: 0, aiAccepted: 0 });
  assert.equal(kpis.defectRate, null);
  assert.equal(kpis.aiAcceptanceRate, null);
  assert.equal(kpis.passed, 0);
});

test('acceptance rate ignores inspections where the AI gave no usable answer', () => {
  const kpis = computeKpis({ total: 4, rejected: 1, aiAssessed: 2, aiAccepted: 1 });
  assert.equal(kpis.aiAcceptanceRate, 50);
  assert.equal(kpis.defectRate, 25);
});

test('rounds to one decimal place', () => {
  const kpis = computeKpis({ total: 3, rejected: 1, aiAssessed: 3, aiAccepted: 2 });
  assert.equal(kpis.defectRate, 33.3);
  assert.equal(kpis.aiAcceptanceRate, 66.7);
});
