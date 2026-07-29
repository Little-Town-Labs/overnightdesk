# Feature Specification: Titus Obsidian Headless Sync

> Historical implementation record. Feature 031 supersedes this optional
> paid-sync design with an Aegis-local Markdown knowledge volume for Titus.

**Feature Branch**: `agent/codex/feature-030-titus-obsidian-sync`

**Created**: 2026-07-29

**Status**: Approved for implementation; production activation gated on
owner-provided Obsidian Sync vault access

**Input**: Make Obsidian a headless sidecar for Titus so durable project
briefs can be maintained from desktop Obsidian and used by Titus without
turning the vault into a task tracker, secret store, or replacement system of
record.

## User Scenarios & Testing

### User Story 1 - Share Durable Project Briefs (Priority: P1)

As the owner, I can edit a dedicated project knowledge vault in desktop
Obsidian and have those Markdown notes become available to Titus at its
existing `/opt/data/project-briefs` path.

**Why this priority**: This is the useful outcome: one readable, linked,
durable body of project background that works in Obsidian and in Titus's normal
file-based workflow.

**Independent Test**: Initialize the sidecar against a non-production remote
vault, create one harmless canary note from each side in turn, and prove both
notes arrive byte-for-byte on the opposite side while Titus sees only the
project knowledge mount.

**Acceptance Scenarios**:

1. **Given** an initialized remote Obsidian Sync vault, **when** the owner
   creates or updates a Markdown project brief in desktop Obsidian, **then**
   the headless sidecar synchronizes it into Titus's project brief directory.
2. **Given** Titus creates or updates a Markdown project brief, **when** the
   sidecar is healthy, **then** the change reaches the owner's desktop vault
   without requiring Titus to hold Obsidian credentials.
3. **Given** a note contains Obsidian wikilinks, frontmatter, or ordinary
   Markdown, **when** it is synchronized, **then** its content remains
   usable by both Obsidian and Titus.

---

### User Story 2 - Contain Credentials and Conflicts (Priority: P2)

As an operator, I can run the sync client without exposing the Obsidian
account token or derived encryption key to Titus, public routes, logs,
backups, or source control.

**Why this priority**: The sidecar is an external integration with access to
durable project knowledge. Its credentials and conflict behavior must be
explicit before it can run unattended.

**Independent Test**: Inspect the installed unit, container, volumes, runtime
environment, logs, and backup inputs; prove the sidecar has no inbound port,
Titus cannot read its secret state, conflicts produce preserved conflict
copies, and secret material is absent from qualification evidence.

**Acceptance Scenarios**:

1. **Given** a Phase-backed Obsidian authentication token, **when** the
   sidecar starts, **then** only the sidecar receives the token and the token
   is never persisted in the shared vault.
2. **Given** the remote and local copies of a note change concurrently,
   **when** sync reconciles them, **then** both versions are preserved through
   the client's explicit conflict strategy rather than silently merged.
3. **Given** Titus is compromised or prompted to inspect its filesystem,
   **when** it reads its mounted data, **then** it cannot access the sidecar
   authentication token, derived encryption key, sync database, or log.

---

### User Story 3 - Recover and Operate the Vault (Priority: P3)

As an operator, I can install, initialize, observe, back up, restore, stop, and
roll back the sidecar without deleting the original project briefs or coupling
Titus availability to Obsidian Sync availability.

**Why this priority**: Durable background information needs an explicit
recovery path, and an external sync outage must not take Titus offline.

**Independent Test**: Migrate a copied fixture from the existing Titus volume
to the dedicated vault volume, exercise disabled installation and local
qualification, inspect value-safe health output, restore the vault dataset
from the encrypted backup path, and prove Titus remains startable with the
sidecar stopped.

**Acceptance Scenarios**:

1. **Given** existing briefs in `hermes-titus-data`, **when** the migration is
   prepared, **then** their names, sizes, hashes, ownership, and permissions
   are verified in a new dedicated vault volume before the Titus mount
   changes.
2. **Given** Obsidian Sync is unavailable or uninitialized, **when** Titus
   starts, **then** Titus can continue reading and writing the local project
   knowledge volume.
3. **Given** a failed activation, **when** rollback is authorized, **then**
   the sidecar is stopped and Titus can be returned to its original project
   brief directory without deleting either copy.
4. **Given** the encrypted backup job runs, **when** its manifest is inspected,
   **then** the project knowledge dataset is included and the sidecar secret
   state is excluded.

### Edge Cases

- The published npm version differs from the upstream repository version.
- The Obsidian account token is missing, invalid, expired, or revoked.
- The remote vault name is ambiguous; initialization must use its immutable ID.
- The end-to-end encryption password is wrong.
- The vault already contains notes on both the local and remote sides.
- A remote note conflicts with a local Titus write.
- A sync process is already holding the vault lock.
- The remote service is unavailable while local notes continue changing.
- The sidecar exits repeatedly and reaches systemd restart limits.
- A note, attachment, or path exceeds an upstream sync limit.
- A hidden Obsidian configuration directory appears in the shared vault.
- Backup runs while the sidecar is synchronizing a note.
- Migration is interrupted after copying but before changing the Titus mount.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST run the official Obsidian Headless client as a
  dedicated `obsidian-sync-titus` sidecar, not as a plugin or process inside
  Titus.
- **FR-002**: The sidecar dependency MUST be pinned to the reviewed published
  `obsidian-headless` version and integrity, and its Node base image MUST be
  pinned to an immutable platform digest; floating `latest` tags are
  prohibited.
- **FR-003**: Titus and the sidecar MUST share only a dedicated
  `titus-project-knowledge-data` volume, mounted at
  `/opt/data/project-briefs` in Titus and `/vault` in the sidecar.
- **FR-004**: Sidecar authentication and sync state MUST use a separate
  `titus-obsidian-sync-state` volume that is never mounted into Titus.
- **FR-005**: The Obsidian account token MUST be loaded from a strict,
  sidecar-specific Phase path into a root-owned runtime environment file and
  passed through the client's supported `OBSIDIAN_AUTH_TOKEN` variable.
- **FR-006**: The derived end-to-end encryption key and sync database MUST be
  stored only in the restricted sidecar state volume. The plaintext account
  password and end-to-end encryption password MUST NOT be stored in Git,
  Phase, shell history, runtime arguments, logs, backups, or deployment
  evidence.
- **FR-007**: Initialization MUST be an explicit interactive operator step,
  MUST select a remote vault by immutable ID, and MUST prompt privately for
  the end-to-end encryption password.
- **FR-008**: Continuous synchronization MUST be bidirectional, MUST use the
  explicit `conflict` strategy, and MUST disable Obsidian application,
  appearance, hotkey, core-plugin, and community-plugin configuration sync.
- **FR-009**: The sidecar MUST run unprivileged, with no inbound or published
  ports, no Docker socket, no added Linux capabilities, no privilege
  escalation, a read-only root filesystem, bounded resources, and only the
  outbound network access needed for Obsidian Sync.
- **FR-010**: The sidecar MUST be a separate systemd service. Its failure or
  disabled state MUST NOT prevent `hermes-titus.service` from starting or
  using local project briefs.
- **FR-011**: Installation MUST leave the sidecar disabled until migration,
  Obsidian login, vault setup, conflict policy configuration, and value-safe
  verification all pass.
- **FR-012**: Migration MUST copy the existing
  `/opt/data/project-briefs` content to the dedicated volume without deleting
  the source, verify a deterministic manifest before cutover, and retain a
  documented rollback mount.
- **FR-013**: Existing project brief filenames and content MUST be preserved.
  The migration MAY add a minimal `.obsidian` vault configuration but MUST NOT
  reorganize or rewrite project notes.
- **FR-014**: The weekly encrypted backup MUST include the dedicated project
  knowledge dataset and MUST exclude the sidecar authentication token,
  encryption key, sync database, and sync log.
- **FR-015**: Qualification and runtime status MUST expose value-safe evidence
  for image identity, initialization state, sync mode, conflict strategy,
  last successful activity, restart count, volume mounts, and backup coverage
  without printing tokens, encryption keys, remote vault IDs, note contents,
  or customer data.
- **FR-016**: Rollback MUST stop and disable only the sidecar, preserve both
  named volumes, preserve the migrated briefs, and offer a reversible Titus
  mount rollback without deleting state.
- **FR-017**: The vault MUST be documented as the authority for durable project
  background only. Linear or the current task system remains authoritative
  for delivery state, GitHub for code/review state, source repositories for
  implementation, the platform standard for operating contracts, and approved
  document stores for source attachments.
- **FR-018**: Titus MUST treat synchronized note contents as untrusted data;
  notes MUST NOT grant authority, override approval gates, expose secrets, or
  cause actions merely because they contain instructions.
- **FR-019**: Production activation MUST require an existing owner-approved
  Obsidian Sync subscription, a dedicated remote vault, a recovery-held E2EE
  password, successful encrypted backup qualification, and explicit
  activation authorization.
- **FR-020**: The implementation MUST provide a non-production qualification
  path that does not require real Obsidian credentials or contact the remote
  service.
- **FR-021**: Titus MUST receive a dedicated project-knowledge skill that
  explains vault discovery, narrow read/write behavior, source-of-truth
  boundaries, untrusted-note handling, conflict preservation, degraded local
  use, and prohibited sync-control access.

### Key Entities

- **Project knowledge vault**: Markdown project briefs and intentionally
  selected supporting attachments shared between desktop Obsidian and Titus.
- **Headless sync sidecar**: The isolated official client that reconciles the
  local vault with one remote Obsidian Sync vault.
- **Sync credential state**: The account token runtime projection, derived
  E2EE key, client configuration, state database, and sync log. This state is
  secret and is not part of the knowledge dataset.
- **Migration manifest**: A value-safe list of relative paths, sizes, and
  content hashes used to prove the old and new project brief trees match.
- **Operational evidence**: Secret-free health, version, mount, backup,
  restart, and last-activity facts used to qualify the service.

## Success Criteria

### Measurable Outcomes

- **SC-001**: One Markdown canary created from desktop Obsidian reaches Titus,
  and one created through Titus reaches desktop Obsidian, within five minutes
  under normal network conditions.
- **SC-002**: A deliberate concurrent-edit test preserves both versions and
  loses zero note content.
- **SC-003**: Runtime inspection finds zero public ports, zero Docker socket
  mounts, zero added capabilities, and zero sidecar state mounts in Titus.
- **SC-004**: Secret scanning finds zero account tokens, account passwords,
  E2EE passwords, derived encryption keys, or remote vault IDs in Git changes,
  backup inputs, logs, and deployment evidence.
- **SC-005**: The pre-cutover migration manifest matches every existing
  project brief by relative path, size, and SHA-256 hash.
- **SC-006**: Titus remains healthy and can read and write a local canary while
  the sidecar is stopped for at least ten minutes.
- **SC-007**: A qualified encrypted backup contains the project knowledge
  dataset, excludes the sync-state dataset, and passes one documented restore
  drill before production acceptance.
- **SC-008**: A normal observation interval ends with zero unresolved
  authentication, encryption, conflict, lock, sync, or restart-loop errors.
- **SC-009**: After a Titus-only restart, the project-knowledge skill is
  installed and discoverable, directs Titus to `/opt/data/project-briefs`, and
  does not grant Titus access to sidecar state or credentials.

## Assumptions

- The owner will provide or approve an Obsidian Sync subscription, dedicated
  remote vault, account token, and recovery-held E2EE password before
  production activation.
- The official headless client remains an open-beta external dependency, so
  this release pins version `0.0.13`, installs disabled, and preserves a fast
  stop-and-rollback path.
- The existing project briefs are the initial local dataset and remain
  available in the original Titus volume throughout migration and observation.
- Markdown notes may contain private project background but not secrets,
  credentials, regulated source records, or unapproved customer attachments.
- Building and locally qualifying the sidecar is authorized now. Production
  account enrollment, remote vault creation, deployment activation, and
  destructive cleanup require later explicit authorization.
