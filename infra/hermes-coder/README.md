# OvernightDesk Hermes Coder Image

This directory is the source of the thin production image used by Walter,
Titus, and Mitchel. It adds GitHub CLI and the approved Git identity required
by Walter's `the_guardian` profile to an immutable official Hermes base.

It contains no credentials. GitHub tokens and all tenant secrets remain
runtime-injected from Phase or permission-restricted local runtime files.

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
