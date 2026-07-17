# Contract: Dirty Landing and Clean Claiming

## LandDirtyEmail

Input is validated provider data plus trusted instance assignment. The command
performs a parameterized insert into `content_staging` and treats the existing
`(source, message_id)` conflict as an idempotent duplicate.

The producer may write common fields and `metadata`; it must never write
`security_status`, `security_error`, or `security_run_at`.

## ClaimCleanEmails

Input: exact `route_id`, `inbox_id`, `target_agent`, and bounded limit.

Within one transaction, select eligible joined clean/staging rows using
`FOR UPDATE ... SKIP LOCKED`, update their `agent_zero_status` to `processing`
and `agent_zero_run_at` to the database clock, and return only `safe_content`
plus bounded trusted reply context.

Rows with missing/mismatched route metadata, non-approved status, or non-queued
consumer state are not returned or modified.

## Complete and Fail

- `Complete(clean_id)`: changes `processing → done` only for the same route.
- `Fail(clean_id, error_code)`: changes `processing → error`, records a bounded
  metadata-only code, and never stores a provider/model error body.
- Both operations are conditional and report whether exactly one row changed.

## Privilege Contract

The runtime database role requires only:

- insert/select on `content_staging` common input columns;
- select on joined staging rows;
- select/update on eligible `ingested_messages` consumer columns;
- no delete, truncate, schema, or SecurityTeam-owned status permissions.
