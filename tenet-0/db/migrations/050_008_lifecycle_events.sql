-- Migration 050_008 — lifecycle_events
-- Feature 50 spec FR-14, EC-2
--
-- Local mirror of President lifecycle transitions. Used when bus is
-- unreachable at the time of the event. On bus recovery, all rows with
-- NULL published_to_bus_at are flushed in created_at order with their
-- original timestamps preserved.

BEGIN;

CREATE TABLE president.lifecycle_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type              TEXT NOT NULL,
  details                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_to_bus_at     TIMESTAMPTZ
);

CREATE INDEX lifecycle_events_created_idx
  ON president.lifecycle_events (created_at DESC);

-- Bus-recovery flush queue
CREATE INDEX lifecycle_events_unflushed_idx
  ON president.lifecycle_events (created_at)
  WHERE published_to_bus_at IS NULL;

-- Append-only with restricted-UPDATE: only published_to_bus_at may be set
CREATE OR REPLACE FUNCTION president.lifecycle_events_pubmark_only() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id           != OLD.id           OR
     NEW.event_type   != OLD.event_type   OR
     NEW.details::text != OLD.details::text OR
     NEW.created_at   != OLD.created_at
  THEN
    RAISE EXCEPTION 'president.lifecycle_events: only published_to_bus_at may be updated; row id=%', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lifecycle_events_pubmark_only
  BEFORE UPDATE ON president.lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION president.lifecycle_events_pubmark_only();

CREATE OR REPLACE FUNCTION president.lifecycle_events_no_delete() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'president.lifecycle_events is append-only; DELETE not permitted (row id=%)', OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lifecycle_events_no_delete
  BEFORE DELETE ON president.lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION president.lifecycle_events_no_delete();

REVOKE DELETE, TRUNCATE ON president.lifecycle_events FROM president_app;
GRANT INSERT, SELECT, UPDATE ON president.lifecycle_events TO president_app;

INSERT INTO president.schema_migrations (version) VALUES ('050_008_lifecycle_events') ON CONFLICT DO NOTHING;

COMMIT;
