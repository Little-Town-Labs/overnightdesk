# Quickstart: Pre-Call Brief

## Local Validation

From the repo root:

```bash
git status --short --branch
.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks
cd tenants/hermes-mitchel/mcp-servers/trevor-db
npm test
npm audit --json
```

Expected:

- Active branch is `003-pre-call-brief`.
- `.specify/feature.json` points at `specs/003-pre-call-brief`.
- `npm test` passes.
- `npm audit --json` reports zero vulnerabilities.

## Production Read-Only Comparison

Use `aegis-ssh` for live checks. Do not print `.env`, credentials, full notes, or generated brief bodies.

```bash
ssh -i ~/.ssh/ssh-key-2026-03-15 ubuntu@147.224.183.55 \
  "docker exec hermes-mitchel sh -lc \
  'test -f /opt/data/mcp-servers/trevor-db/dist/index.js &&
   test -f /opt/data/skills/daily-call-queue/SKILL.md &&
   echo tenant-layout-ok'"
```

Verify baseline counts:

```bash
ssh -i ~/.ssh/ssh-key-2026-03-15 ubuntu@147.224.183.55 \
  "docker exec tenet0-postgres psql -U tenet0_admin -d tenet0 -Atc \
  \"select count(*) from trevor.prospects;
    select count(*) from trevor.call_tasks;
    select count(*) from trevor.interactions;\""
```

## Deployment Shape

When approved later, sync only the built Trevor MCP runtime and pre-call-brief skill to `hermes-mitchel:/opt/data`, restart only `hermes-mitchel`, and append `/home/frosted639/src/overnightdesk-suite/deploys.log`.

This feature should not be deployed automatically as part of local implementation.
