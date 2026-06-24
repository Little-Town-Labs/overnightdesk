-- Feature 008: Prospect sourcing candidate staging for Mitchel/Trevor.
-- Additive and idempotent; no existing prospect, task, or interaction rows are changed.

CREATE TABLE IF NOT EXISTS trevor.prospect_sourcing_runs (
  id bigserial PRIMARY KEY,
  source text NOT NULL,
  enrichment_source text,
  area text NOT NULL,
  keyword text,
  status text NOT NULL DEFAULT 'staged',
  requested_by text,
  candidate_count integer NOT NULL DEFAULT 0,
  recommended_count integer NOT NULL DEFAULT 0,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospect_sourcing_runs_source_check CHECK (
    source IN (
      'browseract_google_maps',
      'browseract_contact_finder',
      'browseract_industry_radar',
      'manual_import'
    )
  ),
  CONSTRAINT prospect_sourcing_runs_enrichment_source_check CHECK (
    enrichment_source IS NULL OR enrichment_source IN (
      'camofox_website_recon',
      'camofox_contact_enrichment',
      'browseract_website_data_scrape'
    )
  ),
  CONSTRAINT prospect_sourcing_runs_status_check CHECK (
    status IN ('staged', 'reviewed', 'promoted', 'failed', 'canceled')
  )
);

CREATE TABLE IF NOT EXISTS trevor.prospect_candidates (
  id bigserial PRIMARY KEY,
  sourcing_run_id bigint NOT NULL REFERENCES trevor.prospect_sourcing_runs(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  company text,
  area text NOT NULL,
  phone text,
  email text,
  website text,
  source_url text,
  enrichment_url text,
  rating numeric,
  review_count integer,
  buyer_type text NOT NULL DEFAULT 'retail_jeweler',
  lead_source text NOT NULL,
  enrichment_source text,
  quality_score integer NOT NULL DEFAULT 0,
  review_status text NOT NULL DEFAULT 'needs_review',
  dedupe_status text NOT NULL DEFAULT 'unique',
  dedupe_reason text,
  review_notes text,
  approved_by text,
  approved_at timestamptz,
  promoted_prospect_id bigint REFERENCES trevor.prospects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospect_candidates_buyer_type_check CHECK (
    buyer_type IN ('retail_jeweler', 'wholesale_dealer', 'private_collector', 'broker')
  ),
  CONSTRAINT prospect_candidates_lead_source_check CHECK (
    lead_source IN (
      'browseract_google_maps',
      'browseract_contact_finder',
      'browseract_industry_radar',
      'manual_import'
    )
  ),
  CONSTRAINT prospect_candidates_enrichment_source_check CHECK (
    enrichment_source IS NULL OR enrichment_source IN (
      'camofox_website_recon',
      'camofox_contact_enrichment',
      'browseract_website_data_scrape'
    )
  ),
  CONSTRAINT prospect_candidates_review_status_check CHECK (
    review_status IN ('recommended', 'needs_review', 'duplicate', 'rejected', 'approved')
  ),
  CONSTRAINT prospect_candidates_dedupe_status_check CHECK (
    dedupe_status IN ('unique', 'possible_duplicate', 'duplicate')
  )
);

CREATE INDEX IF NOT EXISTS idx_prospect_candidates_run_status
  ON trevor.prospect_candidates (sourcing_run_id, review_status, id);

CREATE INDEX IF NOT EXISTS idx_prospect_candidates_business
  ON trevor.prospect_candidates (lower(business_name));

CREATE INDEX IF NOT EXISTS idx_prospect_candidates_promoted
  ON trevor.prospect_candidates (promoted_prospect_id)
  WHERE promoted_prospect_id IS NOT NULL;

DROP TRIGGER IF EXISTS prospect_sourcing_runs_updated_at ON trevor.prospect_sourcing_runs;
CREATE TRIGGER prospect_sourcing_runs_updated_at
  BEFORE UPDATE ON trevor.prospect_sourcing_runs
  FOR EACH ROW
  EXECUTE FUNCTION trevor.set_updated_at();

DROP TRIGGER IF EXISTS prospect_candidates_updated_at ON trevor.prospect_candidates;
CREATE TRIGGER prospect_candidates_updated_at
  BEFORE UPDATE ON trevor.prospect_candidates
  FOR EACH ROW
  EXECUTE FUNCTION trevor.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON
  trevor.prospect_sourcing_runs,
  trevor.prospect_candidates
TO trevor_app;

GRANT USAGE, SELECT ON SEQUENCE
  trevor.prospect_sourcing_runs_id_seq,
  trevor.prospect_candidates_id_seq
TO trevor_app;

COMMENT ON TABLE trevor.prospect_sourcing_runs IS
  'Bounded BrowserAct-first prospect sourcing runs with optional CamoFox enrichment metadata.';

COMMENT ON TABLE trevor.prospect_candidates IS
  'Staged prospect candidates from sourcing runs; candidates require review before promotion into trevor.prospects.';
