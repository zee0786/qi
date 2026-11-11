import { DEFECT_TYPES, NO_DEFECT } from './taxonomy.js';

const toInspection = (row) => ({
  id: row.id,
  batchId: row.batch_id,
  imageRef: row.image_ref,
  aiPredictedDefectType: row.ai_predicted_defect_type,
  aiConfidence: row.ai_confidence === null ? null : Number(row.ai_confidence),
  finalDefectType: row.final_defect_type,
  wasOverridden: row.was_overridden,
  comments: row.comments,
  inspector: row.inspector_name,
  inspectedAt: row.inspected_at,
});

/** All SQL lives here so routes and services stay free of persistence details. */
export function createRepo(pool) {
  return {
    async getUser(id) {
      const { rows } = await pool.query('SELECT id, name, role FROM users WHERE id = $1', [id]);
      return rows[0] ?? null;
    },

    async listUsers() {
      const { rows } = await pool.query('SELECT id, name, role FROM users ORDER BY id');
      return rows;
    },

    async listBatches() {
      const { rows } = await pool.query(
        `SELECT id, product_name AS "productName", production_line AS "productionLine"
         FROM batches ORDER BY id`,
      );
      return rows;
    },

    async getBatch(id) {
      const { rows } = await pool.query('SELECT id FROM batches WHERE id = $1', [id]);
      return rows[0] ?? null;
    },

    async createPrediction(p) {
      const { rows } = await pool.query(
        `INSERT INTO ai_predictions
           (image_ref, model, status, predicted_defect_type, confidence, error_message, raw_response, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          p.imageRef,
          p.model,
          p.status,
          p.predicted,
          p.confidence,
          p.errorMessage,
          p.raw === null ? null : JSON.stringify(p.raw),
          p.createdBy,
        ],
      );
      return rows[0];
    },

    async getPrediction(id) {
      const { rows } = await pool.query('SELECT * FROM ai_predictions WHERE id = $1', [id]);
      return rows[0] ?? null;
    },

    async createInspection(r) {
      const { rows } = await pool.query(
        `INSERT INTO inspections
           (batch_id, prediction_id, image_ref, ai_predicted_defect_type, ai_confidence,
            final_defect_type, was_overridden, comments, inspector_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          r.batchId,
          r.predictionId,
          r.imageRef,
          r.aiPredictedDefectType,
          r.aiConfidence,
          r.finalDefectType,
          r.wasOverridden,
          r.comments,
          r.inspectorId,
        ],
      );
      return rows[0].id;
    },

    async listInspections({ defectType, batchId }) {
      const { rows } = await pool.query(
        `SELECT i.*, u.name AS inspector_name
         FROM inspections i JOIN users u ON u.id = i.inspector_id
         WHERE ($1::text IS NULL OR i.final_defect_type = $1)
           AND ($2::text IS NULL OR i.batch_id = $2)
         ORDER BY i.inspected_at DESC, i.id DESC`,
        [defectType ?? null, batchId ?? null],
      );
      return rows.map(toInspection);
    },

    async getKpiCounts(batchId) {
      const scope = [batchId ?? null];
      const [totals, types] = await Promise.all([
        pool.query(
          `SELECT
             count(*)                                                        AS total,
             count(*) FILTER (WHERE final_defect_type <> $2)                 AS rejected,
             count(*) FILTER (WHERE ai_predicted_defect_type IS NOT NULL)    AS ai_assessed,
             count(*) FILTER (WHERE ai_predicted_defect_type IS NOT NULL
                                AND NOT was_overridden)                      AS ai_accepted
           FROM inspections WHERE ($1::text IS NULL OR batch_id = $1)`,
          [...scope, NO_DEFECT],
        ),
        pool.query(
          `SELECT final_defect_type AS type, count(*) AS n FROM inspections
           WHERE ($1::text IS NULL OR batch_id = $1) AND final_defect_type = ANY($2)
           GROUP BY final_defect_type`,
          [...scope, DEFECT_TYPES],
        ),
      ]);
      const t = totals.rows[0];
      return {
        total: Number(t.total),
        rejected: Number(t.rejected),
        aiAssessed: Number(t.ai_assessed),
        aiAccepted: Number(t.ai_accepted),
        byType: Object.fromEntries(types.rows.map((r) => [r.type, Number(r.n)])),
      };
    },
  };
}
