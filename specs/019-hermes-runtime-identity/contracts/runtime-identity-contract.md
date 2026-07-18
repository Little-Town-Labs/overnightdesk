# Runtime Identity Contract

## Canonical mapping

| Concept | Active value after cutover | Compatibility value retained |
| --- | --- | --- |
| Runtime/container/DNS | `hermes-walter` | `hermes-agent` rollback name |
| Default persona | Walter | Ace is historical only |
| Stable platform record | `tenant-0` | unchanged |
| Public endpoint | `aegis-prod.overnightdesk.com` | unchanged |
| Runtime volume | `hermes-agent-data` | intentionally unchanged |
| Intake route/service | `walter` | `agent` disabled rollback route |
| Intake Phase path | `/agents/hermes-email-intake/walter` | `/agents/hermes-email-intake/agent` retained |
| Intake target | `hermes-walter` | `hermes-agent` rollback tuple |
| AgentMail address | existing address | unchanged compatibility handle |

References to the upstream software, image, package, or official documentation
remain `hermes-agent` and are not obsolete runtime selectors.

## Protected AgentMail tuples

SecurityTeam accepts only exact, code-owned tuples. Email content cannot select
or override any field.

| Route | Inbox | Target runtime | State |
| --- | --- | --- | --- |
| `walter` | existing Walter-compatible inbox | `hermes-walter` | target active tuple |
| `agent` | same inbox | `hermes-agent` | deprecated rollback tuple |
| `titus` | existing Titus inbox | `hermes-titus` | unchanged |
| `mitchel` | existing Mitchel inbox | `hermes-mitchel` | unchanged |

Only one of `agent` or `walter` may have polling enabled at a time. An unknown
route, mismatched inbox, or mismatched target stays wrapped/untrusted.

## Persona and human-access rules

- A persona belongs to exactly one runtime definition.
- A runtime may have multiple personas/profiles.
- A person may be authorized to multiple runtimes.
- Adding an authorized person does not create a new persona or memory store.
- Separate primary memory requires a separate runtime.
- Shared knowledge access must be explicit and does not merge local histories.

## Activation order

1. Source and tests accept Walter while all production selectors remain old.
2. Walter Phase path matches the old route by key count and protected
   fingerprint; old path remains unchanged.
3. SecurityTeam accepts both exact tuples.
4. Stop `hermes-email-intake@agent` and confirm it is inactive.
5. Rename the running container to `hermes-walter` and verify the existing
   volume and security configuration are unchanged.
6. Update/reload Nginx and verify public status, dashboard WebSocket, and API.
7. Change the OIDC canary container mapping and verify owner login/logout.
8. Start `hermes-email-intake@walter` from copied stopped state and verify one
   healthy poll cycle.
9. Update Ops, audit, standards, and deployment evidence.

## Rollback order

1. Stop and disable Walter intake.
2. Restore Nginx and OIDC mapping to `hermes-agent`.
3. Rename `hermes-walter` back to `hermes-agent`.
4. Start the retained Agent intake service from its untouched path/state.
5. Verify public route, dashboard auth, API, memory, cron, and intake.

Rollback never deletes a container, volume, Phase path, or state file.

## Output contract

Allowed evidence: names, counts, fingerprints, status codes, service states,
file counts, sizes, and timestamps.

Forbidden evidence: secret values/fragments, environment dumps, runtime JSON,
prompt bodies, conversation text, memory rows, inbox message bodies, and backup
contents.
