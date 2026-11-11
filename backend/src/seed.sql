INSERT INTO users (name, role) VALUES
  ('Priya Singh', 'quality_engineer'),
  ('Arjun Mehta', 'production_supervisor')
ON CONFLICT (name) DO NOTHING;

INSERT INTO batches (id, product_name, production_line) VALUES
  ('BATCH-001', 'Steel Bracket — Model X200', 'Line 3'),
  ('BATCH-002', 'Aluminium Housing — Model H90', 'Line 1')
ON CONFLICT (id) DO NOTHING;
