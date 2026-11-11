CREATE TABLE IF NOT EXISTS users (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('quality_engineer', 'production_supervisor'))
);

CREATE TABLE IF NOT EXISTS batches (
  id              TEXT PRIMARY KEY,
  product_name    TEXT NOT NULL,
  production_line TEXT NOT NULL
);

-- One row per AI call, kept separate from the inspection it informed.
CREATE TABLE IF NOT EXISTS ai_predictions (
  id                    SERIAL PRIMARY KEY,
  image_ref             TEXT NOT NULL,
  model                 TEXT,
  status                TEXT NOT NULL CHECK (status IN ('ok', 'unusable', 'failed')),
  predicted_defect_type TEXT CHECK (predicted_defect_type IN
    ('Scratch', 'Dent', 'Paint Issue', 'Missing Component', 'No Defect')),
  confidence            NUMERIC(4, 3) CHECK (confidence BETWEEN 0 AND 1),
  error_message         TEXT,
  raw_response          JSONB,
  created_by            INTEGER NOT NULL REFERENCES users (id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The human-confirmed record. AI answer is copied in so overrides stay queryable.
CREATE TABLE IF NOT EXISTS inspections (
  id                       SERIAL PRIMARY KEY,
  batch_id                 TEXT NOT NULL REFERENCES batches (id),
  prediction_id            INTEGER NOT NULL UNIQUE REFERENCES ai_predictions (id),
  image_ref                TEXT NOT NULL,
  ai_predicted_defect_type TEXT CHECK (ai_predicted_defect_type IN
    ('Scratch', 'Dent', 'Paint Issue', 'Missing Component', 'No Defect')),
  ai_confidence            NUMERIC(4, 3),
  final_defect_type        TEXT NOT NULL CHECK (final_defect_type IN
    ('Scratch', 'Dent', 'Paint Issue', 'Missing Component', 'No Defect')),
  was_overridden           BOOLEAN NOT NULL,
  comments                 TEXT,
  inspector_id             INTEGER NOT NULL REFERENCES users (id),
  inspected_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inspections_final_type_idx ON inspections (final_defect_type);
CREATE INDEX IF NOT EXISTS inspections_batch_idx ON inspections (batch_id);
