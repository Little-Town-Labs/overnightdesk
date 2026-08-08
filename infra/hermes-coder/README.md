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

- Official release: Hermes Agent v0.20.0 / v2026.8.3
- OCI index:
  `nousresearch/hermes-agent@sha256:16788311e2fa3035456bdc1bafb8ec2b1777db64ebf020af9bb7eb73c3712c9e`
- Linux ARM64 child:
  `sha256:153a021a0c59f28c1c230b201c8b819403da2a01969b9ffd939f1a429b7af2cd`
- Derived tag: `overnightdesk/hermes-agent:0.20.0-coder`

## Local candidate build

Build on the development host or an approved local CI runner. Aegis is an
artifact-consumer and staging/production host, not a release build host. From
the repository root, verify the Dockerfile hash against the reviewed source,
then build:

```bash
sudo docker buildx build \
  --platform linux/arm64 \
  --pull=false \
  --tag overnightdesk/hermes-agent:0.20.0-coder \
  --load \
  infra/hermes-coder
```

`--pull=false` is intentional: release intake pulls the immutable base first,
and the Dockerfile itself pins that exact digest. After the build, verify the
embedded Hermes version, `gh --version`, image ID, and base pin before staging.

Follow the complete protocol in
`overnightdesk-platform-standard/docs/runbooks/hermes-agent-update-protocol.md`.

The Walter intake helper consumes the exact locally qualified image
`overnightdesk/hermes-agent:0.20.0-coder` identified by
`releases/hermes/0.20.0-local-2026-08-07.yaml`. It does not build an image on
Aegis. Before activation, the helper verifies the image ID
`sha256:3633de9efda759325a6d3a0757dcae476a71526b539e6d435abf1aa2f7d9c2e3`
and the embedded Hermes version. A missing or mismatched artifact fails before
Walter is stopped; the helper also requires the manifest's Linux ARM64 target.

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
