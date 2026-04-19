-- Migration 050_005 — director_memory_index
-- Feature 50 spec FR-12
--
-- Per-Director MEMORY.md-shaped index. Loaded on Director spawn so a
-- fresh subagent gets an accurate one-shot summary on first call to
-- load_memory_index. The index is rebuilt by the MCP server on every
-- write (debounced 5s per department in the application layer).

BEGIN;

CREATE TABLE president.director_memory_index (
  department          TEXT PRIMARY KEY,
  index_md            TEXT NOT NULL,
  version             INTEGER NOT NULL DEFAULT 1,
  entry_count_active  INTEGER NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO president.schema_migrations (version) VALUES ('050_005_director_memory_index') ON CONFLICT DO NOTHING;

COMMIT;
