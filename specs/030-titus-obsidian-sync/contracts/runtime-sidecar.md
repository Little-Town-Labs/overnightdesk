# Runtime Contract: Titus Obsidian Sync Sidecar

## Image

- Local tag: `overnightdesk/obsidian-sync-titus:0.0.13`
- Base:
  `node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3`
- Package: exact `obsidian-headless@0.0.13` from `package-lock.json`
- Image contains no credential, vault, note, or environment file.
- The upstream source is not vendored.

## Container

| Property | Required value |
| --- | --- |
| Name | `obsidian-sync-titus` |
| User | `10000:10000` |
| Root filesystem | read-only |
| Capabilities | drop `ALL` |
| Privilege escalation | disabled |
| PIDs | at most 128 |
| CPU | at most 0.5 |
| Memory | at most 512 MiB |
| Network | Docker bridge, outbound only, no published port |
| Logging | Docker log driver `none`; protected upstream log stays in state volume |
| Vault mount | `titus-project-knowledge-data:/vault` |
| State mount | `titus-obsidian-sync-state:/state` |
| Secret mount | `/run/obsidian-sync-titus/runtime.env:/run/secrets/obsidian-sync-runtime:ro` |
| Temporary storage | bounded noexec/nosuid/nodev tmpfs |

The entrypoint validates the secret file, sources it, fixes no permissions,
and execs:

```text
ob sync --path /vault --continuous
```

## Health

Healthy means:

- exactly one regular mode-0600 sync `config.json` exists below the configured
  state root;
- that config resolves `/vault` as its local vault;
- mode is bidirectional (the upstream default represented by absent
  `syncMode`);
- conflict strategy is `conflict`;
- configuration sync is absent/disabled;
- the vault's `.obsidian/.sync.lock` is held; and
- the continuous process remains alive.

Health output must be a single value-safe status line.

## Initialization

Initialization requires:

1. Service is disabled and container absent.
2. Knowledge migration manifest matches.
3. Runtime token file passes strict validation.
4. Operator supplies a unique remote vault ID through an ephemeral local
   environment value.
5. `ob login` validates the Phase-backed token.
6. `ob sync-setup` prompts for the E2EE password and stores only its derived key.
7. `ob sync-config` enforces bidirectional/conflict/no-config-sync and the
   `Titus Aegis Sidecar` device name.
8. A value-safe validator reads local config and reports only pass/fail fields.

The remote vault ID, account token, E2EE password, derived key, vault name, and
file paths are not written to normal deployment output.

## Mount Cutover

`hermes-titus` receives the dedicated vault mount only if the root-owned
mode-0400 non-symlink cutover marker is valid. Without it, Titus starts exactly
as before from the project brief directory inside `hermes-titus-data`.
Migration also writes a root-owned baseline-identity marker under the local
`.obsidian` directory. Activation compares it with the protected migration
evidence, preventing a deleted and recreated empty volume from satisfying an
old proof.

## Backup

- Dataset label: `titus-project-knowledge`
- Root:
  `/var/lib/docker/volumes/titus-project-knowledge-data/_data`
- Includes: `.`
- Excludes: `.obsidian/.sync.lock`
- SQLite online backup: `false`
- Sidecar state root must not appear anywhere in backup configuration.
- The backup unit quiesces only an active sidecar and resumes only if it
  quiesced it.

## Rollback

Rollback:

1. disables and stops `obsidian-sync-titus.service`;
2. removes only the validated cutover marker;
3. restarts only `hermes-titus.service`;
4. verifies the original project brief directory is visible;
5. preserves both named volumes, runtime state, and migration evidence.

Volume deletion, remote-vault deletion, unlinking, and original-brief cleanup
are outside this contract.
