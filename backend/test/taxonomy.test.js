import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeConfidence, normalizeOutcome } from '../src/taxonomy.js';

test('normalizeOutcome accepts the five supported outcomes in loose formats', () => {
  assert.equal(normalizeOutcome('Dent'), 'Dent');
  assert.equal(normalizeOutcome('  scratch '), 'Scratch');
  assert.equal(normalizeOutcome('paint_issue'), 'Paint Issue');
  assert.equal(normalizeOutcome('MISSING COMPONENT'), 'Missing Component');
  assert.equal(normalizeOutcome('no defect'), 'No Defect');
  assert.equal(normalizeOutcome('none'), 'No Defect');
});

test('normalizeOutcome rejects free text, unsupported categories and non-strings', () => {
  for (const bad of ['Crack', 'scratch and dent', 'The unit looks fine', '', '   ', null, 42, {}]) {
    assert.equal(normalizeOutcome(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test('normalizeConfidence keeps values in [0,1] and drops everything else', () => {
  assert.equal(normalizeConfidence(0.83), 0.83);
  assert.equal(normalizeConfidence(0), 0);
  assert.equal(normalizeConfidence(1), 1);
  for (const bad of [-0.1, 1.2, 83, NaN, '0.8', null, undefined]) {
    assert.equal(normalizeConfidence(bad), null);
  }
});
