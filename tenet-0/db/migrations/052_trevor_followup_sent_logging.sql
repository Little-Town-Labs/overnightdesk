-- Feature 007: Follow-up sent logging metadata for Mitchel/Trevor.
-- Additive and idempotent; no existing draft or interaction rows are changed.

ALTER TABLE trevor.followup_drafts
  ADD COLUMN IF NOT EXISTS sent_by text,
  ADD COLUMN IF NOT EXISTS sent_via text,
  ADD COLUMN IF NOT EXISTS audit_only_reason text,
  ADD COLUMN IF NOT EXISTS sent_interaction_id bigint REFERENCES trevor.interactions(id) ON DELETE SET NULL;

COMMENT ON COLUMN trevor.followup_drafts.sent_by IS
  'Operator who confirmed a manually sent follow-up; not a credential or channel account.';
COMMENT ON COLUMN trevor.followup_drafts.sent_via IS
  'Human-confirmed channel/provider label used for a sent or manually sent follow-up.';
COMMENT ON COLUMN trevor.followup_drafts.audit_only_reason IS
  'Required explanation when recording historical outreach for a do-not-contact prospect.';
COMMENT ON COLUMN trevor.followup_drafts.sent_interaction_id IS
  'Interaction row created when an approved draft is confirmed as sent or manually sent.';

CREATE INDEX IF NOT EXISTS idx_followup_drafts_sent_interaction
  ON trevor.followup_drafts (sent_interaction_id)
  WHERE sent_interaction_id IS NOT NULL;
