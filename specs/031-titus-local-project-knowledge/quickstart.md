# Quickstart: Validate Local Project Knowledge

```bash
tenants/hermes-titus/scripts/qualify.sh
tenants/hermes-titus/scripts/deploy-aegis.sh verify
```

The expected status is a healthy Titus container with
`titus-project-knowledge-data` mounted read-write at
`/opt/data/project-briefs`, a discoverable skill, verified backup coverage,
and no Obsidian dependency.
