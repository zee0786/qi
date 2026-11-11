export const NO_DEFECT = 'No Defect';
export const DEFECT_TYPES = ['Scratch', 'Dent', 'Paint Issue', 'Missing Component'];
export const ALL_OUTCOMES = [...DEFECT_TYPES, NO_DEFECT];

const squash = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z]/g, '');

const LOOKUP = new Map([
  ...ALL_OUTCOMES.map((type) => [squash(type), type]),
  ['none', NO_DEFECT],
  ['nodefects', NO_DEFECT],
  ['nodefectfound', NO_DEFECT],
]);

/** Maps loosely formatted text ("paint_issue", "NO DEFECT") to a supported outcome, or null. */
export function normalizeOutcome(raw) {
  if (typeof raw !== 'string') return null;
  const key = squash(raw);
  return key ? (LOOKUP.get(key) ?? null) : null;
}

/** Accepts only a finite number in [0, 1]; anything else is treated as "no confidence". */
export function normalizeConfidence(raw) {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw > 1) return null;
  return Math.round(raw * 1000) / 1000;
}

export const isDefect = (outcome) => DEFECT_TYPES.includes(outcome);
