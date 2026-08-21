# CLI Contract

The initial command surface is host-local and non-networked:

```text
overnightdesk-maintenance preflight --config PATH --mode read-only
overnightdesk-maintenance inventory --config PATH [--input FIXTURE] --output PATH
overnightdesk-maintenance group --input PATH --output PATH
```

## Modes

- `preflight`: validate non-secret config, target scope, limits, secret
  reference, and required permissions without performing a mutation.
- `inventory`: collect or consume sanitized backup/vulnerability evidence;
  live collection requires an explicit read-only qualification gate.
- `group`: deterministically group sanitized vulnerability evidence without
  network access.

There is no `serve`, `admin`, `delete`, `reboot`, `schedule`, or live `apply`
command in the MVP.

## Exit Codes

- `0`: complete success
- `2`: invalid arguments or config
- `3`: denied by a safety precondition
- `4`: incomplete or interrupted run
- `5`: external dependency/authentication failure
- `6`: validated-but-unknown operation outcome (reserved for future writes)

Human-readable errors are remediation-focused and safe to display. Structured
JSON output is sanitized and includes `run_id`, status, counts, and request IDs.
