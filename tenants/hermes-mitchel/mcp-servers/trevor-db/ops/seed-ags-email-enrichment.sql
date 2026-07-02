BEGIN;

WITH eligible AS (
  SELECT p.id, p.email, to_jsonb(p)->>'website' AS website
  FROM trevor.prospects p
  WHERE coalesce(p.status, 'active') <> 'archived'
    AND (
      p.lead_source ILIKE '%AGS%'
      OR p.notes ILIKE '%AGS%'
    )
),
inserted AS (
  INSERT INTO trevor.prospect_email_enrichment (
    prospect_id,
    source_batch,
    status,
    candidate_website,
    verified_email,
    confidence,
    evidence_source_url,
    last_checked_at,
    evidence_note
  )
  SELECT
    eligible.id,
    'ags_prospect_import',
    CASE WHEN nullif(btrim(coalesce(eligible.email, '')), '') IS NULL THEN 'pending' ELSE 'email_found' END,
    nullif(btrim(eligible.website), ''),
    nullif(btrim(eligible.email), ''),
    CASE WHEN nullif(btrim(coalesce(eligible.email, '')), '') IS NULL THEN NULL ELSE 'official' END,
    CASE WHEN nullif(btrim(coalesce(eligible.email, '')), '') IS NULL THEN NULL ELSE 'trevor.prospects.email' END,
    CASE WHEN nullif(btrim(coalesce(eligible.email, '')), '') IS NULL THEN NULL ELSE now() END,
    CASE WHEN nullif(btrim(coalesce(eligible.email, '')), '') IS NULL THEN NULL ELSE 'Prospect already had an email before enrichment queue processing.' END
  FROM eligible
  ON CONFLICT (prospect_id) DO NOTHING
  RETURNING 1
)
SELECT
  (SELECT count(*) FROM eligible) AS eligible_count,
  (SELECT count(*) FROM inserted) AS inserted_count;

COMMIT;
