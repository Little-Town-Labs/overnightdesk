# Research: Hermes Runtime Identity

## Decision 1: Runtime placement follows use case and primary memory

**Decision**: Treat a Hermes runtime as the execution, tool, channel, and
primary-memory boundary for one use case. Model personas and authorized people
as many-to-one assignments to that runtime. Model a shared knowledge service as
an explicit cross-runtime grant rather than local-memory ownership.

**Rationale**: This matches the user's operating model: Walter serves Aegis
platform operations, Titus serves TTS and may serve Gary plus Austin, Trevor is
the persona serving Mitchel's business runtime, and Rex remains the separate
personal runtime. Existing Aegis facts also distinguish local state from shared
knowledge: Walter and Mitchel have separate named volumes and business tools,
while both may use Open Brain; Titus owns a separate local semantic-memory
provider.

**Alternatives considered**:

- One runtime per persona: rejected because personas that should share tools
  and memory would be fragmented unnecessarily.
- One global runtime for every use case: rejected because TTS, platform ops,
  personal work, and Mitchel's business records have different trust and action
  boundaries.
- Numeric Tenet IDs as the visible identity: deferred. Stable IDs can remain
  compatibility records, but the active operator name should express use case.

## Decision 2: Rename the container in place and retain its volume

**Decision**: Use Docker's in-place container rename from `hermes-agent` to
`hermes-walter`. Continue mounting the existing named volume
`hermes-agent-data` during this feature and document it as a retained
compatibility/state identity.

**Rationale**: The live volume is 1.8 GB with 23,664 files and contains runtime
configuration, sessions, skills, cron state, and local databases. Docker
documents `docker container rename` as an in-place container operation, named
volumes as persisting outside container lifecycle, and user-defined bridge DNS
as resolving containers by name. Retaining the volume avoids a long state copy,
avoids reconstructing a secret-bearing `docker run` environment, and gives an
immediate rollback via the inverse rename.

**Alternatives considered**:

- Clone to `hermes-walter-data`: rejected for this feature because consistent
  copy requires a writer outage, a complete integrity comparison, and careful
  handling of credential-bearing files. It adds risk without changing the
  runtime's use-case boundary.
- Recreate a new Walter container: rejected because the current runtime has
  secret-bearing environment configuration and exact security flags that an
  in-place rename preserves automatically.
- Leave the container as `hermes-agent` and change only the prompt: rejected
  because active routing and monitoring would still encode the obsolete generic
  identity.

**Official sources**:

- https://docs.docker.com/reference/cli/docker/container/rename/
- https://docs.docker.com/reference/cli/docker/container/run/
- https://docs.docker.com/engine/storage/volumes/

## Decision 3: Migrate the protected email route additively

**Decision**: Add `walter` as an allowed intake route and SecurityTeam assertion
before disabling `agent`. Copy the Phase payload to
`/agents/hermes-email-intake/walter`, carry the 12 KB intake polling/idempotency
state into a new `hermes-email-intake-walter-data` volume during a stopped
window, and retain the old service/path/volume disabled for rollback.

**Rationale**: The active intake contract includes three coupled values:
`EMAIL_ROUTE_ID=agent`, `HERMES_TARGET_AGENT=hermes-agent`, and
`HERMES_BASE_URL=http://hermes-agent:8642`. SecurityTeam validates the same
route/inbox/target tuple exactly. An additive contract lets SecurityTeam accept
the new tuple before the runtime switches and preserves the old tuple for
rollback.

**Alternatives considered**:

- Change only the target while keeping route `agent`: rejected because the
  active route would still carry the obsolete identity.
- Replace the AgentMail inbox: rejected because the existing inbox address is a
  stable external compatibility handle and a new mailbox is outside scope.
- Reuse the old intake state volume under the new service: possible, but a
  small stopped copy produces clean active naming while preserving the original
  rollback state.

**Official source**: Phase supports app-, environment-, and path-specific
export/import operations: https://docs.phase.dev/cli/commands

## Decision 4: Preserve stable compatibility identities

**Decision**: Keep `tenant-0`, `aegis-prod.overnightdesk.com`, the existing
AgentMail address, Phase App IDs/service-account IDs, and the upstream
`nousresearch/hermes-agent` software/image name unchanged.

**Rationale**: These values identify a platform record, public endpoint,
external channel, trust boundary, or upstream product—not the Walter persona.
Changing them would broaden risk without clarifying runtime ownership.

**Alternatives considered**:

- Rename every occurrence of `hermes-agent`: rejected because many occurrences
  correctly refer to the upstream product/image/docs rather than this runtime.
- Rename `tenant-0`: rejected because it is an existing stable OIDC/provisioning
  canary record and not a persona label.

## Decision 5: Make credential remediation a production gate

**Decision**: Allow documentation, tests, and source changes to proceed, but do
not activate the production rename until the owner approves a rotation and
scrubbing plan for pre-existing credential material discovered in runtime
memory/backup artifacts.

**Rationale**: The inventory surfaced credential-bearing content in files that
can be recalled by the agent. No values belong in migration evidence. Copying
or further exposing those files without a decision would violate the platform's
secret-handling principles.

**Alternatives considered**:

- Silently edit or delete affected files: rejected because runtime memory and
  backups are user data, and deletion/rotation requires explicit approval.
- Ignore the issue because it predates this feature: rejected because the
  migration would otherwise certify a known unsafe state.

## Live Dependency Inventory (value-suppressed)

| Surface | Current active identity | Walter target |
| --- | --- | --- |
| Docker runtime | `hermes-agent` | `hermes-walter` |
| Stateful volume | `hermes-agent-data` | retained compatibility name |
| Default persona | Ace/AceRockstar in `SOUL.md` | Walter |
| Public Nginx upstream | `hermes-agent:9119/8642` | `hermes-walter:9119/8642` |
| OIDC canary | `tenant-0` -> container `hermes-agent` | same tenant/host -> `hermes-walter` |
| AgentMail service | `hermes-email-intake@agent` | `@walter` |
| AgentMail Phase path | `/agents/hermes-email-intake/agent` | `/agents/hermes-email-intake/walter` |
| Intake state | `hermes-email-intake-agent-data` | copied stopped to `...-walter-data` |
| SecurityTeam tuple | `agent` + inbox + `hermes-agent` | `walter` + same inbox + `hermes-walter` |
| Ops authorship/provenance | `hermes-agent` | `hermes-walter` |
| Audit default/upstreams | `hermes-agent` | `hermes-walter` |
| Health/log artifacts | `hermes-agent.*` | new Walter active artifacts; old retained historical files |

Titus and Mitchel were healthy during the inventory and require no identity,
secret-app, data, or channel migration.
