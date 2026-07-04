-- Feature 011: reviewable public deep-research evidence for Trevor prospects.
-- Additive and idempotent; stores evidence before any prospect mutation.

BEGIN;

DO $$
BEGIN
  IF to_regclass('trevor.prospects') IS NULL THEN
    RAISE EXCEPTION 'Expected baseline table trevor.prospects is missing';
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS trevor.prospect_research_runs (
  id bigserial PRIMARY KEY,
  source_batch text NOT NULL DEFAULT 'prospect_deep_research',
  status text NOT NULL DEFAULT 'running',
  requested_by text,
  prospect_count integer NOT NULL DEFAULT 0,
  evidence_count integer NOT NULL DEFAULT 0,
  warnings text[] NOT NULL DEFAULT ARRAY[]::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospect_research_runs_status_check CHECK (
    status IN ('running', 'completed', 'failed', 'canceled')
  ),
  CONSTRAINT prospect_research_runs_counts_check CHECK (
    prospect_count >= 0 AND evidence_count >= 0
  )
);

CREATE TABLE IF NOT EXISTS trevor.prospect_research_evidence (
  id bigserial PRIMARY KEY,
  prospect_id bigint NOT NULL REFERENCES trevor.prospects(id) ON DELETE CASCADE,
  research_run_id bigint REFERENCES trevor.prospect_research_runs(id) ON DELETE SET NULL,
  source_type text NOT NULL,
  source_url text,
  source_title text,
  found_email text,
  found_phone text,
  business_context_note text,
  search_location_note text,
  evidence_note text,
  confidence text NOT NULL DEFAULT 'unknown',
  review_status text NOT NULL DEFAULT 'pending_review',
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  promoted_at timestamptz,
  promoted_to text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospect_research_evidence_source_type_check CHECK (
    source_type IN (
      'official_site',
      'contact_page',
      'city_directory',
      'chamber_directory',
      'news_story',
      'business_listing',
      'rdap_whois',
      'other_public_source'
    )
  ),
  CONSTRAINT prospect_research_evidence_confidence_check CHECK (
    confidence IN ('official', 'likely', 'possible', 'unknown')
  ),
  CONSTRAINT prospect_research_evidence_review_status_check CHECK (
    review_status IN ('pending_review', 'approved', 'rejected', 'superseded')
  ),
  CONSTRAINT prospect_research_evidence_approval_check CHECK (
    review_status <> 'approved'
    OR (nullif(btrim(coalesce(reviewed_by, '')), '') IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT prospect_research_evidence_content_check CHECK (
    nullif(btrim(coalesce(source_url, '')), '') IS NOT NULL
    OR nullif(btrim(coalesce(found_email, '')), '') IS NOT NULL
    OR nullif(btrim(coalesce(found_phone, '')), '') IS NOT NULL
    OR nullif(btrim(coalesce(business_context_note, '')), '') IS NOT NULL
    OR nullif(btrim(coalesce(search_location_note, '')), '') IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_prospect_research_evidence_prospect
  ON trevor.prospect_research_evidence (prospect_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_prospect_research_evidence_review
  ON trevor.prospect_research_evidence (review_status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_prospect_research_evidence_source
  ON trevor.prospect_research_evidence (source_type, confidence, review_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prospect_research_evidence_dedupe
  ON trevor.prospect_research_evidence (
    prospect_id,
    source_type,
    coalesce(source_url, ''),
    coalesce(found_email, ''),
    coalesce(business_context_note, '')
  );

DROP TRIGGER IF EXISTS prospect_research_runs_updated_at ON trevor.prospect_research_runs;
CREATE TRIGGER prospect_research_runs_updated_at
  BEFORE UPDATE ON trevor.prospect_research_runs
  FOR EACH ROW
  EXECUTE FUNCTION trevor.set_updated_at();

DROP TRIGGER IF EXISTS prospect_research_evidence_updated_at ON trevor.prospect_research_evidence;
CREATE TRIGGER prospect_research_evidence_updated_at
  BEFORE UPDATE ON trevor.prospect_research_evidence
  FOR EACH ROW
  EXECUTE FUNCTION trevor.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON
  trevor.prospect_research_runs,
  trevor.prospect_research_evidence
TO trevor_app;

GRANT USAGE, SELECT ON SEQUENCE
  trevor.prospect_research_runs_id_seq,
  trevor.prospect_research_evidence_id_seq
TO trevor_app;

COMMENT ON TABLE trevor.prospect_research_evidence IS
  'Reviewable public evidence from deep research, linked to Trevor prospects before any promotion.';

COMMENT ON COLUMN trevor.prospect_research_evidence.source_type IS
  'Public source class; rdap_whois is domain-verification only and not sufficient email evidence.';

DO $$
BEGIN
  IF to_regclass('tenet0.schema_migrations') IS NOT NULL THEN
    INSERT INTO tenet0.schema_migrations (version)
    VALUES ('055_trevor_prospect_deep_research')
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
    VALUES ('055_trevor_prospect_deep_research.sql')
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
    VALUES ('055_trevor_prospect_deep_research')
    ON CONFLICT DO NOTHING;
  ELSE
    CREATE TABLE public.schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO public.schema_migrations (filename)
    VALUES ('055_trevor_prospect_deep_research.sql')
    ON CONFLICT DO NOTHING;
  END IF;
END$$;

COMMIT;
