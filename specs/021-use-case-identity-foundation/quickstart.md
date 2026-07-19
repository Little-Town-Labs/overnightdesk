# Implementation Quickstart: Use-Case Identity Foundation

This is a future implementation checklist, not deployment authorization.

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
7. Create the Mitchel canary worktree from the reviewed schema branch.
8. Allocate a stable number only through an approved, audited operation.
9. Prove active member, non-member, and suspended-member behavior before any
   OIDC or Open WebUI assignment uses the new resolver.
10. Keep old reads and all infrastructure names available for rollback through
    the observation window.

Never drop tables, reuse a number, or rename resources as a quick rollback.
