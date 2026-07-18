# Data Model: Hermes Runtime Identity

## Runtime

- `runtime_id`: stable platform record, when one exists
- `runtime_name`: active infrastructure/DNS name
- `use_case`: one operational or business purpose
- `host_boundary`: Aegis or off-host
- `state_store`: runtime-local durable volume
- `primary_memory`: memory whose separation requires another runtime
- `shared_knowledge_grants`: explicit cross-runtime read/write capabilities
- `secret_boundary`: Phase app/service-account identity
- `status`: planned, prepared, active, retained rollback, retired

Runtime-name transition for this feature:

```text
hermes-agent (active) -> hermes-walter (active)
                     -> hermes-agent (retained rollback name)
```

The state store remains `hermes-agent-data`; it does not transition in this
feature.

## Persona

- `persona_name`: human-readable role identity
- `runtime_name`: owning runtime
- `is_default`: whether it supplies the runtime's default `SOUL.md`
- `authority_profile`: bounded tools/actions for the persona
- `source_path`: repo-owned persona definition

Multiple personas may belong to one runtime. A persona does not own a container,
credential, channel, or memory store independently.

## Authorized Person

- `person_id`: stable human principal
- `runtime_name`
- `allowed_channels`
- `authorization_source`
- `status`: planned, active, revoked

Human access is many-to-many with runtimes and independent of persona
assignment.

## Memory Boundary

- `name`
- `kind`: runtime-local, primary semantic, business system, shared knowledge
- `owner_runtime`
- `storage_location`
- `access_mode`: private, explicit shared read, explicit shared read/write
- `consumers`
- `data_classification`

Validation rule: a shared knowledge grant does not change `owner_runtime` and
must not be described as shared local conversation history.

## Runtime Inventory

| Runtime | Use case | Default persona | Other personas/profiles | Authorized people | Primary/local state | Shared knowledge |
| --- | --- | --- | --- | --- | --- | --- |
| `hermes-walter` | Aegis/OvernightDesk platform operations | Walter | Guardian, Librarian | Gary | retained `hermes-agent-data` | Open Brain, explicitly granted |
| `hermes-titus` | TTS collaboration and Control Tower operations | Titus | future profiles allowed | Gary, Austin | `hermes-titus-data` and Titus memory provider | only explicit grants |
| `hermes-mitchel` | Mitchel's diamond-sales workflows | Trevor | workflow subagents | Mitchel | `hermes-mitchel-data` plus Trevor business records | Open Brain, explicitly granted |
| Rex runtime | Gary's personal tooling on gaming desktop | Rex | local profiles | Gary | off-host personal state | selected Aegis knowledge only |

## Route Identity

- `route_id`: protected route selector (`walter`)
- `external_handle`: stable AgentMail address
- `target_runtime`: `hermes-walter`
- `phase_app`: `overnightdesk`
- `phase_path`: `/agents/hermes-email-intake/walter`
- `state_volume`: `hermes-email-intake-walter-data`
- `policy_status`: prepared, accepted, active, retained rollback

Transition:

```text
agent active
  -> walter accepted + agent active
  -> walter active + agent disabled/retained
  -> agent active (rollback only)
```

At no point may both route services poll the same inbox concurrently.

## Cutover Evidence

- source commit/PR per owning repository
- old/new non-secret identity map
- Phase key count and protected fingerprint
- Docker name, mount, network, and health results
- Nginx config test and public route result
- OIDC canary mapping and owner login result
- intake state continuity and health result
- memory/tool/cron checks without content output
- Titus and Mitchel unchanged-health evidence
- platform-standard commit and deployment record

Evidence excludes secret values, prompt bodies, conversation content, memory
records, and credential fragments.
