# Contract: Canonical Persona Presentation

## Mutation

`POST /api/settings/agent-identity/logo` accepts `multipart/form-data` with:

- `runtimeIdentityId`: canonical UUID selected by the authenticated page;
- `logo`: one PNG, JPEG, or WebP file, decoded size 1-262144 bytes.

`DELETE /api/settings/agent-identity/logo` accepts JSON containing the exact
`runtimeIdentityId` and restores the bundled fallback.

Both operations require an authenticated user with one active, unexpired owner
membership for the exact active use-case/runtime and one active default persona
assignment. Authentication failure returns 401, authorization failure returns
403, invalid input returns 400, unavailable authority returns 503, and success
returns `{ "success": true }`. No response contains image bytes, filenames,
database identifiers other than the submitted runtime ID, or internal errors.

## Image read

`GET /api/agent-identity/{runtimeIdentityId}/logo/{sha256}` is intentionally
public presentation media. It returns bytes only when the runtime and its exact
active default persona are active and the stored SHA-256 equals the canonical
lowercase path value. The response includes the stored safe raster content
type, `X-Content-Type-Options: nosniff`, and immutable caching. Every mismatch
returns 404 with no fallback bytes or identity detail.

## Open WebUI consumption

Each deployment supplies data containing the existing base-model ID, canonical
persona name, and an exact HTTPS platform logo URL. A shared idempotent seeder
upserts one base-model override and one wildcard read grant in that deployment's
own persistent database. It never writes credentials, chat content, provider
configuration, or another deployment's volume.

The deployment also sets:

```text
ENABLE_EVALUATION_ARENA_MODELS=false
EVALUATION_ARENA_MODELS=[]
```

The persona model changes presentation only. Open WebUI's own name and logo
remain unmodified.
