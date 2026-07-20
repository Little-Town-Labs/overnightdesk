# Implementation Quickstart: Use-Case Identity Foundation

This checklist now points to the guarded implementation. Production execution
still requires every preflight in the runbook to pass.

1. Confirm the identity ADR and `WHAT/identity.yaml` are merged.
2. Create `021a-identity-schema-resolver` from current `main` and record its
   base commit.
3. Write constraint and resolver tests before migrations or read-path changes.
4. Apply additive schema locally; verify existing application tests with the
   identity feature disabled.
5. Register fixture bindings for current instance, tenant slug, container,
   hostname, volume, Phase path, OIDC client, and orchestrator UUID.
6. Run dual resolution and compare canonical results without logging values
   classified as secrets or customer content.
7. Build the database-backed membership integration once and qualify the same
   policy with controlled Walter, Titus, and Trevor fixtures; do not enable a
   production consumer yet.
8. Allocate the stable number and canonical foundation only through an
   approved, audited operation. The foundation contains zero memberships and
   must converge without requiring a Better Auth user. The
   approved initial sequence is `Tenet 0` for OvernightDesk/Walter, `Tenet 1`
   for Mitchel/Trevor, and `Tenet 2` for TTS/Titus; approval alone does not
   create the canonical database row.
9. Allocate and backfill Tenet 0/Walter, attach Gary's verified membership,
   compare legacy and canonical decisions, and use Walter as the first real
   authorization cutover.
10. Use the guarded `identity:titus:foundation:*` and
   `identity:titus:membership:*` commands to allocate and backfill Tenet 2 plus
   Gary only after their separate confirmations, then use the separately
   confirmed Titus legacy-authoritative shadow boundary. The selected first
   consumer is a dedicated Titus Open WebUI deployment using the exact Better
   Auth OIDC `(issuer, subject)` account key and server-derived runtime,
   hostname, client, and Hermes assignments. Preserve existing Matrix E2EE and
   email sender controls; their external identities do not inherit this
   adapter. Do not wait for Teams, Austin, or Mitchel.
11. Attach Mitchel's membership later through the separate audited command only
   after his Better Auth user is email-verified. Trevor production activation
   remains blocked, but it does not block Walter or Titus.
12. Keep old reads and all infrastructure names available for rollback through
   the observation window.

The exact commands, confirmation phrases, current production inventory, and
rollback rules are in [identity-backfill-runbook.md](identity-backfill-runbook.md).

Never drop tables, reuse a number, or rename resources as a quick rollback.
