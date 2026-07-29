# Research: Titus Local Project Knowledge

## Decision

Use a dedicated Aegis-local named volume containing ordinary Markdown and mount
it directly into Titus. Do not run Obsidian or another knowledge service.

## Rationale

The owner needs one agent-local durable corpus, not desktop synchronization.
Markdown already supplies the useful qualities: readable files, headings,
links, diffs, deterministic backup, and compatibility with a future Obsidian
desktop client if the volume is ever exported. A service would add credentials,
network availability, cost, and conflict behavior without serving the stated
use case.

## Alternatives rejected

- Obsidian Headless Sync: requires a paid account and remote synchronization.
- Desktop Obsidian on Aegis: adds a GUI and does not help Titus use Markdown.
- Git as the live write store: adds merge and credential machinery to a
  single-writer runtime corpus.
- Database or vector store: obscures the source text and duplicates Titus's
  existing recall capabilities.

## Security boundary

Notes are untrusted input. They may inform an answer but cannot authorize tool
use, change policy, provide credentials, or override current state in Linear,
GitHub, production, the platform standard, or approved source systems.
