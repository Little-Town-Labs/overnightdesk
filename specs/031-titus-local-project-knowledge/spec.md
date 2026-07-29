# Feature Specification: Titus Local Project Knowledge

**Feature Branch**: `agent/codex/titus-local-project-knowledge`
**Status**: Implementation
**Input**: Keep Titus project background organized on Aegis without an
Obsidian account, paid sync service, or second user-facing copy.

## User scenarios

### Titus reads durable project context

As the owner, I can ask Titus about a project and Titus can read the relevant
Markdown note from `/opt/data/project-briefs`.

**Acceptance**

1. Given a healthy Titus runtime, the dedicated
   `titus-project-knowledge-data` volume is mounted read-write at
   `/opt/data/project-briefs`.
2. Titus can discover the project-knowledge skill and cite the relative path
   of background it used.
3. Notes cannot grant authority or replace current delivery, code, production,
   or source-record state.

### Titus maintains organized Markdown

As the owner, I can ask Titus to create or update project background and the
change remains durable across a Titus restart.

**Acceptance**

1. Titus can create, read back, update, and delete a temporary canary in the
   mounted volume.
2. The skill prefers an existing note, uses a root `README.md` as an index
   when present, and organizes new material under stable category folders.
3. Titus never requests Obsidian credentials or claims remote synchronization.

### Operators back up the notes

As an operator, I can verify and back up the project notes with the existing
Aegis backup.

**Acceptance**

1. A fresh empty volume is seeded from the existing project briefs.
2. Encrypted backup includes `titus-project-knowledge-data` without stopping
   Titus or another service.

## Functional requirements

- **FR-001**: Project knowledge MUST use ordinary Markdown on one Aegis-local
  named volume.
- **FR-002**: Titus MUST receive the volume read-write at
  `/opt/data/project-briefs` by default.
- **FR-003**: No Obsidian account, token, client, sidecar, systemd unit, network
  dependency, or Phase path MAY be required.
- **FR-004**: Volume preparation MUST create the named volume and seed it only
  when it is empty.
- **FR-007**: Backup MUST archive the dedicated volume directly and MUST NOT
  quiesce Titus.
- **FR-008**: The Titus skill MUST define organization, trust, authority,
  citation, and narrow-write rules.
- **FR-009**: Runtime verification MUST check health, mount identity,
  read-write access, and skill discovery.

## Success criteria

- **SC-001**: Titus is healthy after activation and after one controlled
  restart.
- **SC-002**: A value-safe write/read/delete canary succeeds through Titus's
  mounted path.
- **SC-003**: A fresh encrypted backup contains the project-knowledge dataset
  and passes manifest verification.
- **SC-004**: Repository and production inspection show no active Obsidian
  service, token projection, or synchronization dependency.
