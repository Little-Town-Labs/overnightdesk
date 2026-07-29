# Data Model: Titus Obsidian Headless Sync

## ProjectKnowledgeVault

| Field | Contract |
| --- | --- |
| Volume | `titus-project-knowledge-data` |
| Titus path | `/opt/data/project-briefs` |
| Sidecar path | `/vault` |
| Owner | numeric `10000:10000` |
| Content | Markdown and explicitly approved attachments |
| Authority | Durable project background only |
| Backup | Included in encrypted Aegis application backup |

State transitions:

```text
absent → prepared → copied → manifest_verified → initialized
       → backup_qualified → active → observed
```

No transition deletes the source copy in `hermes-titus-data`.

## SyncState

| Field | Contract |
| --- | --- |
| Volume | `titus-obsidian-sync-state` |
| Container path | `/state` |
| XDG config | `/state/config/obsidian-headless` |
| Owner | numeric `10000:10000` |
| Mode | directories 0700; upstream config/token files 0600 |
| Contains | remote identity, host, encryption version/salt, derived E2EE key, client configuration, SQLite state, protected log |
| Titus access | None |
| Backup | Prohibited |
| Recovery | Recreate through interactive setup |

State transitions:

```text
empty → account_token_available → vault_linked → policy_configured
      → one_shot_verified → continuous
```

Revoked or corrupt state transitions to `stopped`; it is preserved for
diagnosis and can be replaced only after explicit unlink/reinitialization.

## RuntimeCredentialProjection

| Field | Contract |
| --- | --- |
| Phase app | `timeless-tech-solutions` |
| Environment | `production` |
| Path | `/agents/hermes-titus/obsidian-sync` |
| Allowed key | `OBSIDIAN_AUTH_TOKEN` only |
| Runtime file | `/run/obsidian-sync-titus/runtime.env` |
| Runtime file ownership | `root:10000` |
| Runtime file mode | `0440` |
| Persistence | tmpfs/runtime only |

The loader rejects missing, linked, broad, or unexpectedly keyed inputs. The
token is sourced by the container entrypoint from a read-only bind mount and
does not appear in Docker configuration.

## CutoverMarker

| Field | Contract |
| --- | --- |
| Path | `/opt/hermes-titus/obsidian-project-knowledge-enabled` |
| Owner | `root:root` |
| Mode | `0400` |
| Meaning | The copied vault and rollback checks passed; Titus may overlay its project brief path with the dedicated volume |

Missing or invalid markers select the original directory. A symlink is always
invalid.

## MigrationManifest

A sorted, root-only manifest of:

```text
SHA256  relative/path
```

The source and target manifests must match exactly. They may be retained in a
root-only migration evidence directory but must not be printed to deployment
logs because filenames may contain customer or project identifiers.

The SHA-256 of the matching target manifest is also stored as a root-owned,
mode-0400 `.obsidian/.overnightdesk-migration-baseline` file in the knowledge
volume. Pre-activation verification compares that marker with the protected
evidence. This binds an otherwise valid historical manifest to the current
volume while allowing legitimate post-sync note additions and edits.

## SidecarOperationalState

| State | Meaning |
| --- | --- |
| `not_installed` | Image/unit/volumes absent |
| `installed_disabled` | Reproducible runtime present; no sync can start |
| `uninitialized` | State volume lacks exactly one valid vault config |
| `ready_stopped` | Config and policy valid; service disabled/inactive |
| `healthy` | Container running, lock held, Docker health healthy |
| `degraded` | Container running but health starting/unhealthy |
| `failed` | Unit restart limit or runtime error |
| `rolled_back` | Sidecar disabled and Titus using original brief directory |

Status output may include only state, pinned versions, mount names, health,
restart count, and whether recent sync activity exists. It excludes vault IDs,
vault names, filenames, note content, token values, and derived keys.
