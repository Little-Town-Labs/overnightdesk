# Phase Selector Contract

## Titus runtime

- Default app: `timeless-tech-solutions`
- Environment override: `TITUS_PHASE_APP`
- Default environment: `production`
- Required paths: runtime, control-tower, teams, matrix, memory, Titus intake
- Failure: any missing path, unexpected key, invalid value, or Phase timeout
  prevents the service start.

## Email intake

The loader accepts exactly one positional route: `titus`, `agent`, or
`mitchel`. Any other route exits with status 2 before reading a token.

| Route | Default app | Exact path |
| --- | --- | --- |
| `titus` | `timeless-tech-solutions` | `/agents/hermes-email-intake/titus` |
| `agent` | `overnightdesk` | `/agents/hermes-email-intake/agent` |
| `mitchel` | `overnightdesk` | `/agents/hermes-email-intake/mitchel` |

`EMAIL_INTAKE_PHASE_APP` may override the default for a bounded rollback or
verification run. `EMAIL_INTAKE_PHASE_ENVIRONMENT` defaults to `production`.

The loader must pass the selected app, environment, and exact route path to one
value-suppressed Phase export. The strict 14-key and route-consistency checks
remain unchanged.

## Email-fetch

- Target app: `overnightdesk`
- Target environment: `production`
- Target path: `/email-fetch`
- Bootstrap token: existing email-fetch service account after it is granted
  OvernightDesk Production access, or a dedicated replacement token installed
  with mode 0600 and the existing file owner.
- Rollback: restore the preserved script and select `Infrastructure:/`.

## Output and telemetry

- Success messages may include service/route and `ready` state.
- Errors may include app/path names and failure categories.
- No output may include secret values, token fragments, exported JSON, dotenv
  content, or request authorization headers.
