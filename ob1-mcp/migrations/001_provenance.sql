-- 001_provenance.sql
-- Adds the provenance trust layer to ace_memory.
-- Safe to apply to a populated schema: all new columns are nullable or
-- have a backfill default, and all indexes are partial / non-blocking.
--
-- Apply on aegis-prod tenet0-postgres after a pg_dump of schema ace_memory.
--
-- Trust model:
--   observed  -- captured directly from a source (log, tool output, message)
--   inferred  -- model derived this from other context  (EVIDENCE)
--   confirmed -- a human explicitly confirmed it        (INSTRUCTION)
--   imported  -- migrated from older system / transcript
--   generated -- agent-produced during work (review note, summary)
--
-- Consumers should treat "confirmed" + "observed" as instruction-grade
-- and the rest as evidence-grade unless they pass min_provenance filters.

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'provenance' AND n.nspname = 'ace_memory'
    ) THEN
        CREATE TYPE ace_memory.provenance AS ENUM (
            'observed',
            'inferred',
            'confirmed',
            'imported',
            'generated'
        );
    END IF;
END
$$;

ALTER TABLE ace_memory.entries
    ADD COLUMN IF NOT EXISTS provenance        ace_memory.provenance NOT NULL DEFAULT 'imported',
    ADD COLUMN IF NOT EXISTS source            text,
    ADD COLUMN IF NOT EXISTS runtime           text,
    ADD COLUMN IF NOT EXISTS reasoning_model   text,
    ADD COLUMN IF NOT EXISTS channel           text,
    ADD COLUMN IF NOT EXISTS task_id           text,
    ADD COLUMN IF NOT EXISTS confidence        real,
    ADD COLUMN IF NOT EXISTS user_confirmed_at timestamptz,
    ADD COLUMN IF NOT EXISTS supersedes_id     bigint;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'entries_confidence_range'
    ) THEN
        ALTER TABLE ace_memory.entries
            ADD CONSTRAINT entries_confidence_range
            CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'entries_supersedes_fk'
    ) THEN
        ALTER TABLE ace_memory.entries
            ADD CONSTRAINT entries_supersedes_fk
            FOREIGN KEY (supersedes_id) REFERENCES ace_memory.entries(id) ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS entries_provenance_idx
    ON ace_memory.entries (provenance) WHERE is_active;

CREATE INDEX IF NOT EXISTS entries_task_id_idx
    ON ace_memory.entries (task_id) WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS entries_supersedes_idx
    ON ace_memory.entries (supersedes_id) WHERE supersedes_id IS NOT NULL;

COMMIT;
