# OvernightDesk Hermes Coder Image

This directory is the source of the thin production image used by Walter,
Titus, and Mitchel. It adds GitHub CLI, the approved Git identity required by
Walter's `platform_code_worker` profile, and Walter's least-authority
Production Guardian task-intake adapter to an immutable official Hermes base.

It contains no credentials. GitHub tokens and all tenant secrets remain
runtime-injected from Phase or permission-restricted local runtime files.

## Production Guardian intake

The adapter exposes only two exact, bearer-protected routes:

- `POST /api/plugins/platform-task-intake/tasks`
- `POST /api/plugins/platform-task-intake/resolve`

Create requests are forced to Walter's default board as unassigned `triage`
tasks in a scratch workspace. The schema rejects assignee, model, provider,
skill, workspace, board, and status fields. Resolution is limited to tasks
created by `overnightdesk-production-guardian`. An unassigned Guardian
`triage` task is moved through non-runnable `blocked` state before the normal
audited Hermes completion path; assigned tasks fail closed. The dedicated
`PLATFORM_TASK_INTAKE_TOKEN` is injected at runtime from Phase and grants no
general dashboard or Kanban authority.

## Release identity

- Official release: Hermes Agent v0.19.0 / v2026.7.20
- OCI index:
  `nousresearch/hermes-agent@sha256:c1731f7ffd49c37f2b4b6cd01873d4256ba6f06217dfca2cc41cede55815ea82`
- Linux ARM64 child:
  `sha256:4586e3f2375e42e70a13282a19dfe16d4145b22da92a3c46b7aa1643c74a0ec1`
- Derived tag: `overnightdesk/hermes-agent:0.19.0-coder`

## Aegis build

Copy the exact merged directory to `/opt/overnightdesk/hermes-coder`, verify
the Dockerfile hash against the merged source, then build:

```bash
docker build \
  --pull=false \
  --tag overnightdesk/hermes-agent:0.19.0-coder \
  /opt/overnightdesk/hermes-coder
```

`--pull=false` is intentional: release intake pulls the immutable base first,
and the Dockerfile itself pins that exact digest. After the build, verify the
embedded Hermes version, `gh --version`, image ID, and base pin before staging.

Follow the complete protocol in
`overnightdesk-platform-standard/docs/runbooks/hermes-agent-update-protocol.md`.

For the Production Guardian intake adapter, use the rollback-safe deployment
helper from the merged repository:

```bash
sudo infra/hermes-coder/deploy-walter-intake.sh preflight
sudo infra/hermes-coder/deploy-walter-intake.sh prepare
sudo infra/hermes-coder/deploy-walter-intake.sh activate --approve-walter-restart
sudo infra/hermes-coder/deploy-walter-intake.sh verify
```

The helper reads only `WALTER_INTAKE_TOKEN` from the Guardian Phase path,
stops the routed Walter email intake, applies the reviewed
`platform_code_worker` profile migration from the merged `overnightdesk-ops`
checkout, recreates Walter with the exact existing environment plus the
adapter token, and then restarts intake. It retains the stopped previous
container and restores both that container and the old profile automatically
if the private route, Nginx denial, public status, intake, or runtime checks
fail. Run `rollback` to restore the retained container and profile during the
observation window.
