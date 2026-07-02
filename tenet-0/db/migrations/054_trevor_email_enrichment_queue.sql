-- Feature 010 support: durable Trevor prospect email enrichment queue.
-- Additive and idempotent; replaces prompt/memory-only progress tracking.

BEGIN;

DO $$
BEGIN
  IF to_regclass('trevor.prospects') IS NULL THEN
    RAISE EXCEPTION 'Expected baseline table trevor.prospects is missing';
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS trevor.prospect_email_enrichment (
  id bigserial PRIMARY KEY,
  prospect_id bigint NOT NULL REFERENCES trevor.prospects(id) ON DELETE CASCADE,
  source_batch text NOT NULL DEFAULT 'ags_prospect_import',
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  claimed_by text,
  claimed_at timestamptz,
  last_checked_at timestamptz,
  next_retry_at timestamptz,
  candidate_website text,
  contact_page_url text,
  evidence_source_url text,
  verified_email text,
  confidence text,
  evidence_note text,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospect_email_enrichment_prospect_unique UNIQUE (prospect_id),
  CONSTRAINT prospect_email_enrichment_status_check CHECK (
    status IN (
      'pending',
      'claimed',
      'website_found',
      'email_found',
      'no_email_found',
      'needs_review',
      'error',
      'skipped'
    )
  ),
  CONSTRAINT prospect_email_enrichment_confidence_check CHECK (
    confidence IS NULL OR confidence IN ('official', 'likely', 'possible', 'unknown')
  ),
  CONSTRAINT prospect_email_enrichment_attempt_count_check CHECK (attempt_count >= 0),
  CONSTRAINT prospect_email_enrichment_email_status_check CHECK (
    status <> 'email_found'
    OR (
      nullif(btrim(coalesce(verified_email, '')), '') IS NOT NULL
      AND nullif(btrim(coalesce(evidence_source_url, '')), '') IS NOT NULL
      AND confidence IN ('official', 'likely')
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_prospect_email_enrichment_status
  ON trevor.prospect_email_enrichment (status, next_retry_at ASC NULLS FIRST, updated_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_prospect_email_enrichment_batch
  ON trevor.prospect_email_enrichment (source_batch, status, id);

CREATE INDEX IF NOT EXISTS idx_prospect_email_enrichment_prospect
  ON trevor.prospect_email_enrichment (prospect_id);

DROP TRIGGER IF EXISTS prospect_email_enrichment_updated_at ON trevor.prospect_email_enrichment;
CREATE TRIGGER prospect_email_enrichment_updated_at
  BEFORE UPDATE ON trevor.prospect_email_enrichment
  FOR EACH ROW
  EXECUTE FUNCTION trevor.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON
  trevor.prospect_email_enrichment
TO trevor_app;

GRANT USAGE, SELECT ON SEQUENCE
  trevor.prospect_email_enrichment_id_seq
TO trevor_app;

COMMENT ON TABLE trevor.prospect_email_enrichment IS
  'Durable, idempotent queue for one-pass and retryable prospect email enrichment.';

COMMENT ON COLUMN trevor.prospect_email_enrichment.evidence_source_url IS
  'Public source URL supporting the enrichment result; required before verified_email can update trevor.prospects.email.';

DO $$
BEGIN
  IF to_regclass('tenet0.schema_migrations') IS NOT NULL THEN
    INSERT INTO tenet0.schema_migrations (version)
    VALUES ('054_trevor_email_enrichment_queue')
    ON CONFLICT DO NOTHING;
  ELSIF to_regclass('public.schema_migrations') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'schema_migrations'
        AND column_name = 'filename'
    ) THEN
    INSERT INTO public.schema_migrations (filename)
    VALUES ('054_trevor_email_enrichment_queue.sql')
    ON CONFLICT DO NOTHING;
  ELSIF to_regclass('public.schema_migrations') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'schema_migrations'
        AND column_name = 'version'
    ) THEN
    INSERT INTO public.schema_migrations (version)
    VALUES ('054_trevor_email_enrichment_queue')
    ON CONFLICT DO NOTHING;
  ELSE
    CREATE TABLE public.schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO public.schema_migrations (filename)
    VALUES ('054_trevor_email_enrichment_queue.sql')
    ON CONFLICT DO NOTHING;
  END IF;
END$$;

COMMIT;
