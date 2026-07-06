-- Migration 051 — Trevor prospecting data model
-- Feature 001 / Trevor Prospecting Data Model
--
-- Extends the existing live trevor schema for Mitchel's sales-support
-- workflow. This migration intentionally asserts the current baseline
-- tables instead of trying to recreate them from scratch.

BEGIN;

DO $$
BEGIN
  IF to_regclass('trevor.prospects') IS NULL THEN
    RAISE EXCEPTION 'Expected baseline table trevor.prospects is missing';
  END IF;

  IF to_regclass('trevor.interactions') IS NULL THEN
    RAISE EXCEPTION 'Expected baseline table trevor.interactions is missing';
  END IF;

  IF to_regclass('trevor.memory') IS NULL THEN
    RAISE EXCEPTION 'Expected baseline table trevor.memory is missing';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION trevor.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

ALTER TABLE trevor.prospects
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS preferred_channel text,
  ADD COLUMN IF NOT EXISTS do_not_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS do_not_contact_reason text,
  ADD COLUMN IF NOT EXISTS last_outcome text,
  ADD COLUMN IF NOT EXISTS next_action_type text,
  ADD COLUMN IF NOT EXISTS next_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'prospects_do_not_contact_reason_check'
      AND conrelid = 'trevor.prospects'::regclass
  ) THEN
    ALTER TABLE trevor.prospects
      ADD CONSTRAINT prospects_do_not_contact_reason_check
      CHECK (
        do_not_contact = false
        OR nullif(btrim(coalesce(do_not_contact_reason, '')), '') IS NOT NULL
      );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS trevor.call_tasks (
  id bigserial PRIMARY KEY,
  prospect_id bigint NOT NULL REFERENCES trevor.prospects(id) ON DELETE CASCADE,
  task_type text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  reason text NOT NULL,
  call_objective text,
  status text NOT NULL DEFAULT 'open',
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_tasks_task_type_check CHECK (
    task_type = ANY (ARRAY['call', 'email', 'social', 'telegram', 'sms', 'research', 'other'])
  ),
  CONSTRAINT call_tasks_status_check CHECK (
    status = ANY (ARRAY['open', 'completed', 'snoozed', 'discarded'])
  ),
  CONSTRAINT call_tasks_completed_at_check CHECK (
    status <> 'completed' OR completed_at IS NOT NULL
  )
);

COMMENT ON TABLE trevor.call_tasks IS
  'Prospecting work queue for Trevor to support Mitchel sales calls and follow-up.';
COMMENT ON COLUMN trevor.call_tasks.reason IS
  'Human-readable reason this task exists, shown in call queue recommendations.';
COMMENT ON COLUMN trevor.call_tasks.call_objective IS
  'Short objective or suggested ask for the sales action.';

CREATE TABLE IF NOT EXISTS trevor.followup_drafts (
  id bigserial PRIMARY KEY,
  prospect_id bigint NOT NULL REFERENCES trevor.prospects(id) ON DELETE CASCADE,
  interaction_id bigint REFERENCES trevor.interactions(id) ON DELETE SET NULL,
  channel text NOT NULL,
  subject text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  approved_by text,
  approved_at timestamptz,
  sent_at timestamptz,
  external_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT followup_drafts_channel_check CHECK (
    channel = ANY (ARRAY['email', 'telegram', 'sms', 'linkedin', 'instagram', 'phone', 'other'])
  ),
  CONSTRAINT followup_drafts_status_check CHECK (
    status = ANY (ARRAY['draft', 'approved', 'sent', 'manual_sent', 'discarded'])
  ),
  CONSTRAINT followup_drafts_approved_check CHECK (
    status NOT IN ('approved', 'sent', 'manual_sent')
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  ),
  CONSTRAINT followup_drafts_sent_check CHECK (
    status NOT IN ('sent', 'manual_sent')
    OR sent_at IS NOT NULL
  )
);

COMMENT ON TABLE trevor.followup_drafts IS
  'Human-reviewable follow-up drafts. Drafts are not completed interactions until approved and sent or manually confirmed.';
COMMENT ON COLUMN trevor.followup_drafts.external_message_id IS
  'Optional identifier from a future send-capable channel integration; never stores credentials.';

CREATE INDEX IF NOT EXISTS idx_prospects_do_not_contact
  ON trevor.prospects (do_not_contact, status);
CREATE INDEX IF NOT EXISTS idx_prospects_next_action
  ON trevor.prospects (next_action_at ASC NULLS LAST, priority DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospects_priority
  ON trevor.prospects (priority DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospects_lead_source
  ON trevor.prospects (lead_source)
  WHERE lead_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_call_tasks_status_due
  ON trevor.call_tasks (status, due_at ASC NULLS LAST, priority DESC);
CREATE INDEX IF NOT EXISTS idx_call_tasks_prospect
  ON trevor.call_tasks (prospect_id, status, due_at ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_call_tasks_type
  ON trevor.call_tasks (task_type, status);

CREATE INDEX IF NOT EXISTS idx_followup_drafts_status
  ON trevor.followup_drafts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_drafts_prospect
  ON trevor.followup_drafts (prospect_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_drafts_channel
  ON trevor.followup_drafts (channel, status);
CREATE INDEX IF NOT EXISTS idx_followup_drafts_approval
  ON trevor.followup_drafts (approved_at DESC NULLS LAST, sent_at DESC NULLS LAST);

DROP TRIGGER IF EXISTS call_tasks_updated_at ON trevor.call_tasks;
CREATE TRIGGER call_tasks_updated_at
  BEFORE UPDATE ON trevor.call_tasks
  FOR EACH ROW
  EXECUTE FUNCTION trevor.set_updated_at();

DROP TRIGGER IF EXISTS followup_drafts_updated_at ON trevor.followup_drafts;
CREATE TRIGGER followup_drafts_updated_at
  BEFORE UPDATE ON trevor.followup_drafts
  FOR EACH ROW
  EXECUTE FUNCTION trevor.set_updated_at();

GRANT USAGE ON SCHEMA trevor TO trevor_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  trevor.prospects,
  trevor.interactions,
  trevor.memory,
  trevor.call_tasks,
  trevor.followup_drafts
TO trevor_app;
GRANT USAGE, SELECT ON SEQUENCE
  trevor.prospects_id_seq,
  trevor.interactions_id_seq,
  trevor.memory_id_seq,
  trevor.call_tasks_id_seq,
  trevor.followup_drafts_id_seq
TO trevor_app;

DO $$
BEGIN
  IF to_regclass('tenet0.schema_migrations') IS NOT NULL THEN
    INSERT INTO tenet0.schema_migrations (version)
    VALUES ('051_trevor_prospecting')
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
    VALUES ('051_trevor_prospecting.sql')
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
    VALUES ('051_trevor_prospecting')
    ON CONFLICT DO NOTHING;
  ELSE
    CREATE TABLE public.schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO public.schema_migrations (filename)
    VALUES ('051_trevor_prospecting.sql')
    ON CONFLICT DO NOTHING;
  END IF;
END$$;

COMMIT;
