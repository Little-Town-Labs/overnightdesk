-- Migration 050_010 — bus_watcher_state
-- Feature 50 spec FR-1, EC-6
--
-- Single-row table tracking the tenet0-bus-watcher daemon's LISTEN/NOTIFY
-- cursor. Crash recovery reads last_acked_event_id and resumes from the
-- next event.

BEGIN;

CREATE TABLE president.bus_watcher_state (
  id                       INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_acked_event_id      UUID,
  last_acked_at            TIMESTAMPTZ,
  notifier_mode            TEXT NOT NULL DEFAULT 'comm-module' CHECK (notifier_mode IN ('comm-module','polling','direct-telegram')),
  last_mode_change_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bootstrap the single row on first run.
INSERT INTO president.bus_watcher_state (id, notifier_mode)
  VALUES (1, 'comm-module')
  ON CONFLICT DO NOTHING;

INSERT INTO president.schema_migrations (version) VALUES ('050_010_bus_watcher_state') ON CONFLICT DO NOTHING;

COMMIT;
