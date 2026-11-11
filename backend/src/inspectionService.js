import { HttpError } from './errors.js';
import { normalizeOutcome } from './taxonomy.js';

const MAX_COMMENT_LENGTH = 1000;

/** An override means the AI gave an answer and the human's final call differs from it. */
export function computeOverride(aiPredicted, finalDefectType) {
  return aiPredicted != null && aiPredicted !== finalDefectType;
}

/** Validates the engineer's input and derives the record to persist. The client never sends was_overridden. */
export function buildInspectionRecord({
  batchId,
  prediction,
  finalDefectType,
  comments,
  inspectorId,
}) {
  const final = normalizeOutcome(finalDefectType);
  if (!final)
    throw new HttpError(400, 'finalDefectType must be a supported defect type or "No Defect"');

  const trimmed = typeof comments === 'string' ? comments.trim() : '';
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new HttpError(400, `comments must be at most ${MAX_COMMENT_LENGTH} characters`);
  }

  const aiPredicted = prediction.status === 'ok' ? prediction.predicted_defect_type : null;
  return {
    batchId,
    predictionId: prediction.id,
    imageRef: prediction.image_ref,
    aiPredictedDefectType: aiPredicted,
    aiConfidence: aiPredicted ? prediction.confidence : null,
    finalDefectType: final,
    wasOverridden: computeOverride(aiPredicted, final),
    comments: trimmed || null,
    inspectorId,
  };
}
