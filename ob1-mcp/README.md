# ob1-mcp

MCP server exposing Ace's long-term memory (`ace_memory` schema in tenet0-postgres) over Streamable HTTP.

## Tools

- `save_thought(content, category, tags)`
- `search_thoughts(query, top_k, category?, include_inactive?)`
- `list_thoughts(category?, limit, include_inactive?)`
- `forget_thought(id, hard?)`
- `memory_stats()`

## Env

| Var | From |
| --- | --- |
| `DATABASE_URL` | Phase `/ob1/DATABASE_URL` (postgresql://ace_app:...@tenet0-postgres:5432/tenet0) |
| `OPENROUTER_API_KEY` | Phase `/ob1/OPENROUTER_API_KEY` (or `OPENROUTER_API_KEY_GARY`) |
| `MCP_ACCESS_KEY` | Phase `/ob1/MCP_ACCESS_KEY` (bearer for hermes) |
| `EMBEDDING_MODEL` | optional, default `openai/text-embedding-3-small` |
| `PORT` | optional, default `3000` |

## Auth

All requests require `Authorization: Bearer <MCP_ACCESS_KEY>`. `/healthz` is unauthenticated.

## Deploy

Built and run on aegis-prod via the main `/opt/overnightdesk/docker-compose.yml`. Source rsynced to `~/ob1-mcp/`.
