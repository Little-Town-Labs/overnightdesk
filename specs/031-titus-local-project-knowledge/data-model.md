# Data Model: Titus Local Project Knowledge

## Knowledge volume

| Field | Value |
|---|---|
| Docker volume | `titus-project-knowledge-data` |
| Titus path | `/opt/data/project-briefs` |
| Access | read-write |
| Owner | `10000:10000` |
| Content | Markdown and explicitly selected supporting files |
| Backup dataset | `titus-project-knowledge` |

## Suggested organization

| Path | Purpose |
|---|---|
| `README.md` | vault index and navigation |
| `00-inbox/` | newly captured context awaiting classification |
| `10-projects/` | durable project briefs |
| `20-decisions/` | background decisions, not authoritative ADRs |
| `30-reference/` | terminology and stable reference notes |
| `90-archive/` | superseded context retained for history |

Existing root notes remain valid and are not moved automatically.

An empty volume may be seeded once from
`hermes-titus-data/project-briefs`. Existing volume content is never replaced
by preparation.
