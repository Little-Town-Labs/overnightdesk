# Qualification Report Contract

The report is JSON and is safe to retain in local CI artifacts. It must include
the following top-level fields:

```json
{
  "schema_version": 1,
  "run_id": "hermes-local-<opaque-id>",
  "candidate_id": "<candidate-id>",
  "mode": "source",
  "host_architecture": "<bounded-value>",
  "overall_status": "passed",
  "promotion": "blocked",
  "gates": [],
  "agents": [],
  "cleanup": {"status": "passed"}
}
```

Required behavior:

- `run_id` is unique per invocation and contains no filesystem or credential
  values.
- `gates` and `agents` use bounded names and safe reason codes.
- `agents` contains exactly `walter`, `titus`, and `mitchel`.
- `promotion` is `blocked` for source-only results and every failure.
- Only a passing runtime-mode report may use
  `eligible_for_aegis_staging`.
- The report contains no secret values, raw fixture bodies, prompt content, or
  unbounded endpoint strings.
