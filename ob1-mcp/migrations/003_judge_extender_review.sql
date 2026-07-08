-- 003_judge_extender_review.sql
-- Adds durable review queue primitives for OpenBrain Judge Extender:
--   * review_candidates: future-facing memories proposed by judge decisions
--   * review_actions: audit trail of human/platform review actions

BEGIN;

CREATE TABLE IF NOT EXISTS ace_memory.review_candidates (
    id                   bigserial PRIMARY KEY,
    candidate_id         text NOT NULL UNIQUE,
    source_decision_id   text NOT NULL REFERENCES ace_memory.judge_decisions(decision_id) ON DELETE CASCADE,
    workspace_id         text NOT NULL,
    project_id           text,
    task_id              text,
    flow_id              text,
    candidate_kind       text NOT NULL CHECK (candidate_kind IN ('decision', 'lesson', 'failure', 'constraint', 'open_question')),
    proposed_content     text NOT NULL,
    proposed_category    text NOT NULL,
    proposed_tags        text[] NOT NULL DEFAULT ARRAY[]::text[],
    provenance_status    text NOT NULL CHECK (provenance_status IN ('observed', 'inferred', 'confirmed', 'imported', 'generated')),
    confidence           double precision,
    suggested_use_policy ace_memory.memory_use_policy NOT NULL DEFAULT 'requires_confirmation',
    visibility_scope     text NOT NULL DEFAULT 'project' CHECK (visibility_scope IN ('personal', 'project', 'workspace', 'org')),
    review_status        text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'confirmed', 'evidence_only', 'restricted', 'rejected', 'disputed', 'stale', 'superseded')),
    review_priority      text NOT NULL DEFAULT 'normal' CHECK (review_priority IN ('low', 'normal', 'high')),
    reason               text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    reviewed_at          timestamptz,
    reviewed_by          text,
    result_memory_id     bigint REFERENCES ace_memory.entries(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS review_candidates_status_idx
    ON ace_memory.review_candidates (review_status, created_at DESC);

CREATE INDEX IF NOT EXISTS review_candidates_workspace_idx
    ON ace_memory.review_candidates (workspace_id, project_id, review_status);

CREATE INDEX IF NOT EXISTS review_candidates_source_decision_idx
    ON ace_memory.review_candidates (source_decision_id);

CREATE TABLE IF NOT EXISTS ace_memory.review_actions (
    id               bigserial PRIMARY KEY,
    candidate_id     text NOT NULL REFERENCES ace_memory.review_candidates(candidate_id) ON DELETE CASCADE,
    action           text NOT NULL CHECK (action IN ('confirm', 'edit', 'evidence_only', 'restrict_scope', 'mark_stale', 'reject', 'dispute', 'supersede')),
    reviewer         text NOT NULL,
    note             text,
    edited_content   text,
    new_use_policy   ace_memory.memory_use_policy,
    new_scope        text CHECK (new_scope IS NULL OR new_scope IN ('personal', 'project', 'workspace', 'org')),
    result_memory_id bigint REFERENCES ace_memory.entries(id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_actions_candidate_idx
    ON ace_memory.review_actions (candidate_id, created_at DESC);

COMMIT;
