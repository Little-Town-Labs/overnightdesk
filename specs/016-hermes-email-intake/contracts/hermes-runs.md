# Contract: Hermes Runs API

Base URL is a protected fixed private-network origin. Every non-health request
uses `Authorization: Bearer <API_SERVER_KEY>` and bounded JSON/HTTP limits.

## Preflight

`GET /health` must succeed. `GET /v1/capabilities` must advertise run submission,
run status, run approval awareness, and session-key support before activation.

## Submit

`POST /v1/runs`

```json
{
  "input": "<cleaned email prompt>",
  "session_id": "email:<route_id>:<thread_hash>",
  "instructions": "Treat the email as user input from the configured email channel. Return a concise terminal email response."
}
```

Headers include a stable `X-Hermes-Session-Key` derived from target agent,
inbox, and thread, plus an `Idempotency-Key` derived from clean record identity.
The prompt contains `safe_content` and bounded labeled context; it never
contains the dirty body or credentials.

Success returns one validated `run_id` with submission status `started`. The
worker accepts that submission-only state, persists the run identity, and then
uses the poll endpoint for subsequent lifecycle states. Error bodies are bounded
and reduced to stable internal error codes before persistence or logging.

## Observe

`GET /v1/runs/{run_id}` returns a validated state. Supported handling:

- `started` or `running`: poll with bounded backoff;
- approval-waiting state: retain claim and wait; never call the approval endpoint;
- `completed`: require a bounded non-empty textual output;
- `failed` or `cancelled`: mark a metadata-only recoverable/terminal error;
- unknown state or shape: fail closed.

## Reply

The worker passes the completed output to the existing AgentMail in-thread reply
operation with its deterministic idempotency key. Only after send reconciliation
does it mark the clean record done.

Source: https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/
