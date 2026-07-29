# Implementation Plan: Titus Local Project Knowledge

## Summary

Make `titus-project-knowledge-data` the backing store for Titus's existing
`/opt/data/project-briefs` path, remove the unused Obsidian runtime, keep the
volume in the existing encrypted backup, and teach Titus how to organize and
safely maintain the Markdown corpus.

## Technical context

- Runtime: Docker container managed by `hermes-titus.service`
- Storage: Docker named volumes on Aegis
- Source: ordinary Markdown; no database and no network protocol
- Identity: UID/GID `10000:10000`
- Backup: root-only encrypted Aegis producer
- Public surface: none

## Design

```text
Titus
  `/opt/data/project-briefs` (read-write)
             |
             v
  `titus-project-knowledge-data`
             |
             v
  encrypted Aegis backup dataset
```

On a fresh installation, the existing brief directory seeds the volume only
when the volume is empty. The volume is then the sole active authoring path.

## Delivery order

1. Add failing qualification checks for the local-only contract.
2. Create/seed the named volume during normal Titus volume preparation.
3. Mount it by default and remove Obsidian source dependencies.
4. Revise the Titus skill, backup unit, and platform standard.
5. Qualify, review, publish, deploy, restart, canary, and back up.

## Risks and controls

- Empty-volume masking: normal volume preparation seeds only an empty volume
  while Titus is stopped.
- Prompt injection: skill treats every note as untrusted context.
- Data loss: the dedicated volume is included in encrypted backup.
- Backup inconsistency: ordinary Markdown is archived directly; writes are
  atomic at file level and the producer already retries changed-file archives.
