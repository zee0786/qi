import { DEFECT_TYPES } from './taxonomy.js';

const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/**
 * counts: { total, rejected, aiAssessed, aiAccepted, byType }
 * - Defect rate = rejected / total inspected.
 * - AI acceptance = accepted as-is / inspections where the AI produced a usable answer
 *   (inspections logged after an AI failure have no prediction to accept or reject).
 */
export function computeKpis(counts) {
  const { total, rejected, aiAssessed, aiAccepted, byType = {} } = counts;
  return {
    totalInspected: total,
    passed: total - rejected,
    rejected,
    defectRate: percent(rejected, total),
    aiAcceptanceRate: percent(aiAccepted, aiAssessed),
    aiAssessed,
    defectBreakdown: DEFECT_TYPES.map((defectType) => ({
      defectType,
      count: byType[defectType] ?? 0,
    })),
  };
}
