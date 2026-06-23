-- Trevor prospecting data model verification contract.
-- Run with:
--   psql "$TENET0_ADMIN_URL" -v ON_ERROR_STOP=1 -f specs/001-trevor-prospecting-data-model/contracts/schema-verification.sql

\echo 'trevor tables'
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'trevor'
  AND table_name IN ('prospects', 'interactions', 'memory', 'call_tasks', 'followup_drafts')
ORDER BY table_name;

\echo 'prospect cadence columns'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'trevor'
  AND table_name = 'prospects'
  AND column_name IN (
    'lead_source',
    'preferred_channel',
    'do_not_contact',
    'do_not_contact_reason',
    'last_outcome',
    'next_action_type',
    'next_action_at',
    'priority'
  )
ORDER BY ordinal_position;

\echo 'call task columns'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'trevor'
  AND table_name = 'call_tasks'
ORDER BY ordinal_position;

\echo 'follow-up draft columns'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'trevor'
  AND table_name = 'followup_drafts'
ORDER BY ordinal_position;

\echo 'constraints'
SELECT conrelid::regclass::text AS table_name, conname, contype
FROM pg_constraint
WHERE connamespace = 'trevor'::regnamespace
  AND conrelid::regclass::text IN ('trevor.call_tasks', 'trevor.followup_drafts', 'trevor.prospects')
ORDER BY table_name, conname;

\echo 'indexes'
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'trevor'
  AND tablename IN ('prospects', 'call_tasks', 'followup_drafts')
ORDER BY tablename, indexname;

\echo 'triggers'
SELECT event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'trevor'
  AND event_object_table IN ('prospects', 'memory', 'call_tasks', 'followup_drafts')
ORDER BY event_object_table, trigger_name;

\echo 'trevor_app grants'
SELECT grantee, table_schema, table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'trevor'
  AND grantee = 'trevor_app'
  AND table_name IN ('prospects', 'interactions', 'memory', 'call_tasks', 'followup_drafts')
GROUP BY grantee, table_schema, table_name
ORDER BY table_name;

\echo 'trevor_app sequence grants'
SELECT grantee, object_schema, object_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
FROM information_schema.role_usage_grants
WHERE object_schema = 'trevor'
  AND object_type = 'SEQUENCE'
  AND grantee = 'trevor_app'
  AND object_name IN (
    'prospects_id_seq',
    'interactions_id_seq',
    'memory_id_seq',
    'call_tasks_id_seq',
    'followup_drafts_id_seq'
  )
GROUP BY grantee, object_schema, object_name
ORDER BY object_name;
