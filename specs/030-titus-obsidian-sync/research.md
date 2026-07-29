# Research: Titus Obsidian Headless Sync

## Decision 1: Use the official headless client

**Decision**: Use the official `obsidian-headless` npm client as a standalone
sidecar.

**Rationale**: Obsidian documents headless sync for giving agentic tools access
to a vault without access to a full computer and for synchronizing a shared
team vault to a server. The supported commands include login, remote-vault
listing, setup, configuration, status, and continuous sync.

**Sources**:

- <https://obsidian.md/help/headless>
- <https://github.com/obsidianmd/obsidian-headless>

**Alternatives rejected**:

- Full desktop Obsidian on Aegis adds a GUI, browser/runtime dependencies, and
  a larger attack surface.
- A community REST plugin creates an inbound API and custom authentication
  surface when the need is file synchronization.
- Git-only synchronization does not provide the owner-selected Obsidian Sync
  user experience and creates a second merge/push workflow for Titus.

## Decision 2: Pin the published package

**Decision**: Pin `obsidian-headless@0.0.13` and its npm integrity. Do not
vendor the package.

**Rationale**: On 2026-07-29, npm publishes `0.0.13`, while the upstream
repository describes `0.0.14`. The package metadata declares Node `>=22` and
`UNLICENSED`. The implementation consumes the published artifact as an
external dependency, records its integrity, avoids copying its source into
this repository, and treats upgrades as reviewed canaries.

**Evidence**:

- npm shasum:
  `f3fd7de1a9c30c6cd31f3e636bc55b6c11044d86`
- npm integrity:
  `sha512-biu7K0njASixXkV/foG+gmVWiU75oWGxOPrLWeQheYozeIQfImp72VGdKxwkU0kCXrh24js4zbuArCexcXfi2w==`
- Package tarball inspected locally; it contains `cli.js`, `package.json`,
  README, and platform-specific birth-time helpers.

**Alternative rejected**: Building unpublished `0.0.14` from the repository
would bypass npm publication, introduce a custom source build, and muddy the
license boundary.

## Decision 3: Use two volumes and a runtime token projection

**Decision**:

- `titus-project-knowledge-data` holds the shared vault.
- `titus-obsidian-sync-state` holds the client config, derived E2EE key, state
  database, and protected sync log.
- `OBSIDIAN_AUTH_TOKEN` comes from a root-created, sidecar-only runtime file
  backed by Phase path `/agents/hermes-titus/obsidian-sync`.

**Rationale**: Package inspection shows Linux state under
`${XDG_CONFIG_HOME:-$HOME/.config}/obsidian-headless`. The account token can
come from `OBSIDIAN_AUTH_TOKEN`; otherwise it is written to `auth_token` mode
0600. Each vault's `config.json`, also mode 0600, contains the vault location,
remote identity, host, encryption version, base64-derived encryption key,
salt, device name, and conflict strategy. The SQLite state database and
`sync.log` live beside that config.

The account token therefore need not be written to the state volume, but the
derived E2EE key necessarily remains there under the upstream supported model.
Separating the state keeps it outside Titus and outside content backups.

**Alternatives rejected**:

- Sharing all of `hermes-titus-data` gives the sidecar access to auth, memory,
  channels, logs, and tools.
- Putting state in the shared vault exposes secrets to Titus and desktop
  clients.
- Passing `--password` arguments exposes secrets in process listings and shell
  history.

## Decision 4: Initialize interactively and suppress public runtime logs

**Decision**: Login validation and `sync-setup` run in an explicit interactive
one-off container. The E2EE password is privately prompted. Continuous sync
runs through a systemd-managed container with Docker logging disabled.

**Rationale**: The upstream CLI supports private TTY prompts when password
arguments are omitted. Its continuous mode prints vault identity and file paths
to stdout and also writes a protected state-volume log. Disabling the Docker
log driver avoids copying project filenames and remote IDs into journald while
retaining the restricted upstream log for diagnostics.

**Alternative rejected**: Fully non-interactive setup requires putting the E2EE
password on a command line or building an unsupported prompt automation layer.

## Decision 5: Preserve conflicts instead of silently merging

**Decision**: Configure `--mode bidirectional`,
`--conflict-strategy conflict`, and `--configs ""`.

**Rationale**: Project briefs are durable background. Preserving both
concurrent versions is safer than allowing most-recent or automatic merge
behavior to silently rewrite meaning. Desktop preferences, plugins, and
appearance do not belong on the server.

**Alternatives rejected**:

- `merge` can hide concurrent semantic changes.
- `pull-only` prevents Titus-created briefs from reaching the owner.
- `mirror-remote` can revert valid Titus changes.
- Settings sync expands the shared data surface and brings plugins into a
  headless environment.

## Decision 6: Marker-gate the Titus mount

**Decision**: `run-container.sh` mounts the dedicated vault only when a
root-owned, mode-0400 cutover marker exists.

**Rationale**: Deploying source before migration must not cause a later routine
Titus restart to hide the existing `/opt/data/project-briefs` directory behind
an empty named volume. The marker makes installation inert until copy,
manifest comparison, initialization, backup, and activation gates pass.

**Alternative rejected**: Unconditionally adding the volume mount makes source
delivery itself a state migration.

## Decision 7: Quiesce sync around encrypted backup

**Decision**: The backup unit stops the sidecar only if active, records that
fact in `/run`, and restarts it in `ExecStopPost`. The knowledge volume becomes
an explicit dataset; the sync-state volume is absent from all backup inputs.

**Rationale**: Markdown has no online snapshot API. A brief pause gives the
archive a coherent local tree. `ExecStopPost` restores the prior active state
even when the producer fails. Titus remains live throughout.

**Alternative rejected**: Backing up while files reconcile can capture a
mixed-time tree. Backing up sync state would copy account/vault metadata,
derived keys, and a reproducible client database that should instead be
reinitialized.

## Decision 8: Keep systems of record explicit

**Decision**: The vault is authoritative only for durable project background.

**Rationale**:

- Linear/current task system: delivery work and status
- GitHub: code, issues, reviews, and releases
- Platform standard: deployed architecture and operations
- Source repositories: implementation and versioned runbooks
- Approved document stores: source attachments and customer records
- Titus memory: conversational continuity, not project record authority

This prevents a convenient Markdown workspace from becoming an ungoverned
shadow database.
