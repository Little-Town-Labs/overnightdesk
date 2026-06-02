-- 002_judge_v1_storage.sql
-- Adds the first Judge V1 storage primitives:
--   * explicit memory use policy on entries
--   * action proposal envelopes
--   * judge decision write-back records
--
-- Canonical implementation note:
--   The guide uses "user_confirmed"; this schema keeps the existing runtime
--   enum value "confirmed" for the same concept to avoid churn in live data.

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'memory_use_policy' AND n.nspname = 'ace_memory'
    ) THEN
        CREATE TYPE ace_memory.memory_use_policy AS ENUM (
            'can_use_as_instruction',
            'can_use_as_evidence',
            'requires_confirmation',
            'do_not_inject_automatically'
        );
    END IF;
END
$$;

ALTER TABLE ace_memory.entries
    ADD COLUMN IF NOT EXISTS use_policy ace_memory.memory_use_policy;

UPDATE ace_memory.entries
   SET use_policy = CASE
       WHEN provenance IN ('observed', 'confirmed') THEN 'can_use_as_instruction'::ace_memory.memory_use_policy
       WHEN provenance = 'imported' THEN 'can_use_as_evidence'::ace_memory.memory_use_policy
       ELSE 'requires_confirmation'::ace_memory.memory_use_policy
   END
 WHERE use_policy IS NULL;

ALTER TABLE ace_memory.entries
    ALTER COLUMN use_policy SET NOT NULL,
    ALTER COLUMN use_policy SET DEFAULT 'requires_confirmation';

CREATE INDEX IF NOT EXISTS entries_use_policy_idx
    ON ace_memory.entries (use_policy) WHERE is_active;

CREATE TABLE IF NOT EXISTS ace_memory.action_proposals (
    id              bigserial PRIMARY KEY,
    proposal_id     text NOT NULL UNIQUE,
    schema_version  text NOT NULL,
    workspace_id    text NOT NULL,
    project_id      text,
    task_id         text,
    flow_id         text,
    action_id       text NOT NULL,
    idempotency_key text NOT NULL UNIQUE,
    risk_class      text NOT NULL,
    tool_name       text,
    target_system   text,
    proposal        jsonb NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS action_proposals_task_idx
    ON ace_memory.action_proposals (task_id) WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS action_proposals_action_idx
    ON ace_memory.action_proposals (action_id);

CREATE TABLE IF NOT EXISTS ace_memory.judge_decisions (
    id              bigserial PRIMARY KEY,
    decision_id     text NOT NULL UNIQUE,
    schema_version  text NOT NULL,
    workspace_id    text NOT NULL,
    project_id      text,
    task_id         text,
    flow_id         text,
    action_id       text NOT NULL,
    proposal_id     text REFERENCES ace_memory.action_proposals(proposal_id) ON DELETE SET NULL,
    idempotency_key text NOT NULL UNIQUE,
    decision        text NOT NULL CHECK (decision IN ('allow', 'block', 'revise', 'escalate')),
    confidence      text CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low')),
    judge_kind      text CHECK (judge_kind IS NULL OR judge_kind IN ('llm', 'rule', 'hybrid', 'human')),
    decision_doc    jsonb NOT NULL,
    memory_used     jsonb NOT NULL DEFAULT '[]'::jsonb,
    memory_to_write jsonb NOT NULL DEFAULT '{}'::jsonb,
    requires_review boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS judge_decisions_task_idx
    ON ace_memory.judge_decisions (task_id) WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS judge_decisions_action_idx
    ON ace_memory.judge_decisions (action_id);

CREATE INDEX IF NOT EXISTS judge_decisions_decision_idx
    ON ace_memory.judge_decisions (decision);

COMMIT;
