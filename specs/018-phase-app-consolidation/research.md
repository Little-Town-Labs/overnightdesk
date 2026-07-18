# Research: Phase App Consolidation

## Decision 1: Use Apps as the trust boundary

**Decision**: Keep two active apps aligned to the TTS and OvernightDesk use
cases. Use paths only to scope runtime injection and organization.

**Rationale**: Phase grants users and service accounts access at App and
Environment scope. The default Service role can access secrets throughout an
application, so paths do not provide an independent blast-radius boundary.

**Alternatives considered**: Keep three apps by historical Aegis placement;
split every persona into an app; rely on paths as authorization. Each conflicts
with the accepted use-case and shared-memory model.

## Decision 2: Copy before activation

**Decision**: Copy source values into empty target paths and require exact key
count plus canonical JSON SHA-256 equality before changing consumers.

**Rationale**: Copy-first is reversible and allows validation without changing
running services. `Infrastructure:/` currently contains 55 entries;
`overnightdesk:/email-fetch` was empty before copy. Agent and Mitchel intake
each contain 14 entries and had empty destinations before copy.

**Alternatives considered**: Move/delete in one operation; hand-enter values;
compare only key names. These add data-loss, transcription, or silent value
drift risk.

## Decision 3: Preserve email-fetch compatibility first

**Decision**: Copy the entire 55-entry Infrastructure root into
`overnightdesk:/email-fetch` for the initial cutover.

**Rationale**: The live job currently injects all 55 entries. Narrowing the key
set at the same time would combine a boundary migration with an undocumented
behavior change. After observation, a separate change can identify and remove
unused keys from the path.

**Alternatives considered**: Copy only keys mentioned by the standards file;
split legacy keys across new paths during cutover. Both could omit an implicit
dependency.

## Decision 4: Make route selection explicit

**Decision**: Default Titus runtime and Titus intake to
`timeless-tech-solutions`; default Agent and Mitchel intake to `overnightdesk`.
Keep an explicit override for rollback and controlled verification.

**Rationale**: One global intake default cannot represent two app boundaries.
Environment selection is a public operational interface and must be validated
per route.

**Alternatives considered**: Duplicate the loader per route; set hidden systemd
environment overrides only on Aegis. Both would make source and runtime drift.

## Decision 5: Rename by stable application identity

**Decision**: Rename app ID `f8e85a82-d424-49f7-9522-1586510f185c` from
`azure-ops` to `timeless-tech-solutions` only after consumers and grants are
ready.

**Rationale**: Phase's Apps API updates the existing App identity. Name-based
consumers still need coordinated updates.

**Alternatives considered**: Create a fourth app and copy TTS values; delete and
recreate the app. The plan has no free slot and deletion is irreversible.

## Decision 6: Avoid value-bearing CLI output

**Decision**: Do not use `phase secrets list` for migration evidence. Export to
mode-0700 temporary storage, output only key names/counts/fingerprints, and
remove temporary files immediately.

**Rationale**: Phase CLI 2.1.0's list view masks values but still displays value
fragments. That output is unsuitable for terminals and deployment logs.

**Alternatives considered**: Rely on masking; redirect only selected rows.
Neither prevents accidental fragments from appearing.

## Sources

- Phase Apps API: <https://docs.phase.dev/public-api/apps>
- Phase API authentication: <https://docs.phase.dev/public-api>
- Phase App access: <https://docs.phase.dev/console/apps>
- Phase service accounts: <https://docs.phase.dev/access-control/service-accounts>
- Phase CLI commands: <https://docs.phase.dev/cli/commands>
