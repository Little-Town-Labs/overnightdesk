BEGIN;

CREATE TABLE IF NOT EXISTS trevor.prospect_import_runs (
  id bigserial PRIMARY KEY,
  source_batch text NOT NULL,
  source_label text NOT NULL,
  file_path text,
  original_filename text,
  requested_by text,
  total_rows integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  needs_review_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  enrichment_inserted_count integer NOT NULL DEFAULT 0,
  enrichment_already_queued_count integer NOT NULL DEFAULT 0,
  enrichment_existing_email_count integer NOT NULL DEFAULT 0,
  enrichment_reset_claimed_count integer NOT NULL DEFAULT 0,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospect_import_runs_source_batch_created
  ON trevor.prospect_import_runs (source_batch, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_prospect_import_runs_created
  ON trevor.prospect_import_runs (created_at DESC, id DESC);

GRANT SELECT, INSERT ON trevor.prospect_import_runs TO trevor_app;
GRANT USAGE, SELECT ON SEQUENCE trevor.prospect_import_runs_id_seq TO trevor_app;

COMMIT;
