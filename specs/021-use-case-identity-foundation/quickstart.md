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
10. Allocate and backfill Tenet 2/Titus plus Gary next. Preserve existing
   Matrix E2EE and email sender controls until their external identities have a
   separately approved canonical adapter; do not wait for Teams or Austin.
11. Attach Mitchel's membership later through the separate audited command only
   after his Better Auth user is email-verified. Trevor production activation
   remains blocked, but it does not block Walter or Titus.
12. Keep old reads and all infrastructure names available for rollback through
   the observation window.

The exact commands, confirmation phrases, current production inventory, and
rollback rules are in [identity-backfill-runbook.md](identity-backfill-runbook.md).

Never drop tables, reuse a number, or rename resources as a quick rollback.
