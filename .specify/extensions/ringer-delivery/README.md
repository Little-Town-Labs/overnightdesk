# Sol-Luna Ringer Delivery Extension

This local Spec Kit extension adds a checked delivery decision between
`analyze` and `implement`.

- `speckit.ringer-delivery.prepare` classifies context, scale, and risk; records
  graph evidence; and generates a durable `delivery.md` plus scratch Ringer
  manifests.
- `speckit.ringer-delivery.run` executes only the prepared route, keeps
  sensitive and production mutation with Sol, and enforces the bounded quality
  loop.

The checked generator, not the human gate alone, enforces brownfield graph
evidence. It rejects brownfield feature/system requests unless graph status is
`ready` and at least one evidence item is recorded. The extension therefore
keeps `codebase-memory-mcp` conditionally optional for greenfield and micro work.

Routine implementation and routine review use `codex-luna`; `codex-sol` owns
planning and the distinct final quality gate.

Install locally from a project root:

```bash
specify extension add --dev /home/frosted639/src/ringer-workflows/extension/ringer-delivery
```

The extension intentionally does not replace core Spec Kit templates. Project
constitutions and repository `AGENTS.md` instructions remain authoritative.
The absolute source path in local installation metadata records provenance;
execution uses the project-local installed workflow. Machine-local tool paths
remain intentional until this overlay receives an approved organizational
remote.
