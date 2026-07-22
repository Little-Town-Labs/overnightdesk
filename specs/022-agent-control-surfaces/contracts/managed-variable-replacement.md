# Contract: Managed Variable Replacement

## Browser request

`POST /api/settings/agent-variables`

```json
{
  "agentKey": "titus",
  "variableId": "openrouter_api_key",
  "value": "new-write-only-value",
  "requestId": "018f6f54-...",
  "confirmation": "replace:openrouter_api_key:restart"
}
```

Limits: JSON only, bounded body, one variable per request, exact Zod schema,
no unknown fields. `agentKey` is only a presentation selector; the server maps
it to the active membership/runtime. Raw Phase App/environment/path/key,
tenant ID, runtime ID, restart target, or secret map is rejected.

## Response envelope

Success:

```json
{
  "success": true,
  "data": {
    "variableId": "openrouter_api_key",
    "outcome": "replaced",
    "runtimeEffect": "restart",
    "runtimeEffectStatus": "completed"
  }
}
```

Partial success uses HTTP 502, `success: false`, error code
`RUNTIME_EFFECT_FAILED`, and metadata stating that the value was replaced but
manual recovery is required. No response contains a submitted/existing value,
Phase coordinate, external body, internal token, or stack trace.

Error mapping:

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | Malformed JSON/body/confirmation |
| 401 | `UNAUTHORIZED` | No current session |
| 403 | `FORBIDDEN` | Membership/role/admin policy denied |
| 404 | `AGENT_NOT_FOUND` | Explicit selector does not resolve |
| 409 | `DUPLICATE_REQUEST` | Request ID already completed or in flight |
| 422 | `INVALID_VALUE` | Catalog validator rejected new value |
| 423 | `VARIABLE_UNAVAILABLE` | Safe boundary/effect is not deployed |
| 429 | `RATE_LIMITED` | Bounded retry response |
| 502 | `SECRET_WRITE_FAILED` | External write failed without claimed success |
| 502 | `RUNTIME_EFFECT_FAILED` | Write succeeded; required effect failed |
| 503 | `AUTHORITY_UNAVAILABLE` | Canonical authorization/binding/audit unavailable |

## Server evaluation order

1. Authenticate current session.
2. Parse exact request schema and enforce size/rate bounds.
3. Resolve exact selected-agent context.
4. Resolve catalog entry and validate value/confirmation.
5. Reauthorize membership role and optional platform admin role.
6. Resolve exactly one supported secret boundary.
7. Persist metadata-only attempt audit/idempotency claim.
8. Call the boundary-aware provisioner with one internal key/value.
9. Execute declared runtime effect.
10. Persist metadata-only outcome and return value-free response.

The existing `/api/settings/update-credential` arbitrary `{secrets}` contract is
deprecated and must reject the old shape before the new endpoint is enabled.
