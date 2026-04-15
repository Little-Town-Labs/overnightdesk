-- Security hardening from QG-1 review.
-- Addresses:
--   C1: Postgres grants EXECUTE on new functions in schema public to PUBLIC
--       by default, so rotate_credential / activate_constitution / internal
--       _* helpers were callable by tenet0_app. Revoke PUBLIC, grant admin
--       SPs to tenet0_admin only, keep internal helpers unexposed.
--   C3: hide the bcrypt credential_hash column from tenet0_app — only the
--       SECURITY DEFINER SPs should touch it (via crypt()).
--
-- Left intentionally for a follow-up refactor (tracked as residual risk):
--   C2: tenet0_app has direct SELECT on events, so a compromised
--       tenet0_app DB password + Postgres network reachability lets an
--       attacker run raw SELECT on any event. The proper fix is to
--       REVOKE SELECT on events from tenet0_app and add a SECURITY
--       DEFINER read_event(p_credential, p_id) SP that enforces
--       subscriber-namespace access. That requires coordinated changes
--       in bus-go and bus-ts (replayMissed / deliverById) — out of scope
--       for this migration. In the interim, protect the tenet0_app DB
--       password at the same level as the bcrypt department bearers.

-- --------------------------------------------------------------------------
-- C1: revoke PUBLIC, grant admin SPs to tenet0_admin only
-- --------------------------------------------------------------------------
REVOKE ALL ON FUNCTION rotate_credential(TEXT, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION activate_constitution(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rotate_credential(TEXT, TEXT, INT) TO tenet0_admin;
GRANT EXECUTE ON FUNCTION activate_constitution(BIGINT) TO tenet0_admin;

-- Internal helpers: never called directly by application code. Revoke from
-- PUBLIC so a compromised tenet0_app cannot forge audit rows or spoof
-- credential verification outside of a public SP.
REVOKE ALL ON FUNCTION _verify_credential(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION _audit(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION _causality_depth(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION _matching_rule(TEXT) FROM PUBLIC;

-- Going forward, any new function in public defaults to no PUBLIC execute.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- --------------------------------------------------------------------------
-- C3 (columns): reduce departments exposure
-- --------------------------------------------------------------------------
-- tenet0_app gets column-scoped SELECT. credential_hash /
-- previous_credential_hash are not readable — only the SECURITY DEFINER
-- SPs (which run as owner) may touch them via crypt().
REVOKE SELECT ON departments FROM tenet0_app;
GRANT SELECT (id, namespace_prefix, status) ON departments TO tenet0_app;
