# Tenet-0

Gary's corporate-hierarchy agent bus. A dedicated PostgreSQL instance
brokers events between President, ops, cro, fin, tech, and secops
"departments." Every publish is constitutionally governed; every Claude
call is budget-governed; every decision is in the audit log.

**Scope:** Tenet-0 is the root tenant — Gary's own business. Customer
tenants may opt into this pattern but are not required to. Keep that in
mind when reading the constitution.

## Architecture at a glance

```
                  ┌──────────────────────────────────────┐
                  │        tenet0-postgres (PG 16)       │
                  │                                      │
                  │  events, approvals_active,           │
                  │  audit_log, department_budgets,      │
                  │  constitution_versions, ...          │
                  │                                      │
                  │  publish_event()  ack_event()        │
                  │  check_budget()   record_token_usage()│
                  └──────────────▲───────────────────────┘
                                 │  LISTEN / NOTIFY event_bus
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
    ┌─────┴─────┐          ┌─────┴─────┐          ┌─────┴─────┐
    │ bus-go    │          │ bus-ts    │          │  future   │
    │ (agents,  │          │ (agents,  │          │  tenants  │
    │ tools)    │          │ web)      │          │           │
    └───────────┘          └───────────┘          └───────────┘
```

All writes go through stored procedures — client roles have EXECUTE on
the SPs, never direct INSERT/UPDATE/DELETE on the underlying tables.
This is where namespace, approval, causality, and budget enforcement
live.

## Repository layout

```
tenet-0/
├── README.md                     ← you are here
├── Makefile                      ← bus-go-test | bus-ts-test | contract-test | all-tests
├── docker-compose.yml            ← tenet0-postgres service definition
├── db/
│   ├── migrations/               ← 001 … 009 — schema + SPs + views
│   ├── init/                     ← postgres first-boot: roles + migrate
│   ├── migrate.sh                ← bump-constitution dispatcher
│   ├── test.sh                   ← DB-level SQL tests (bats-style)
│   └── tests/                    ← assertion scripts
├── deploy/
│   ├── gen-secrets.sh            ← one-time secret generation
│   └── smoke-test.sh             ← full-stack deploy validation
├── shared/
│   ├── constitution.md           ← prose (intent)
│   ├── constitution-rules.yaml   ← machine-readable rules (enforcement)
│   ├── bus-go/                   ← Go client library + contract-cli
│   └── bus-ts/                   ← TypeScript client library + bump-constitution CLI
└── contract-tests/               ← Go ⟷ TS interop test suite
```

## Local development quickstart

Requires: Docker, Go 1.25+, Node 22+, an external Docker network called
`overnightdesk_overnightdesk` (create with `docker network create
overnightdesk_overnightdesk` if running outside the full platform).

```bash
# 1. Generate secrets (one-time; refuses to overwrite existing file)
cd tenet-0
bash deploy/gen-secrets.sh

# 2. Start postgres + auto-apply all migrations
docker compose up -d

# 3. Validate the deploy
bash deploy/smoke-test.sh
# → "OK — Tenet-0 postgres deployment validated"

# 4. Build the client libraries
(cd shared/bus-ts && npm install && npm run build)
(cd shared/bus-go && go build ./...)

# 5. Run the full test matrix (needs PG_TEST_ADMIN_URL pointing at
#    a Postgres with superuser creds — usually the local deploy).
#    Source the env file instead of scraping it on the command line so
#    the password never lands in shell history.
set -a; source secrets/tenet0.env; set +a
export PG_TEST_ADMIN_URL="postgres://tenet0_admin:${POSTGRES_PASSWORD}@localhost:5432/postgres"
make all-tests
```

## Publishing an event (Go)

```go
import bus "github.com/overnightdesk/tenet-0/shared/bus-go"

cfg := bus.Config{
    PostgresURL: os.Getenv("TENET0_PG_URL"),
    Department:  "ops",
    Credential:  os.Getenv("TENET0_CREDENTIAL"),
}
b, _ := bus.Connect(ctx, cfg)
defer b.Close()

eventID, err := b.Publish(ctx, "ops.job.completed", []byte(`{"job_id":"j-42"}`))
```

## Publishing an event (TypeScript)

```ts
import { Bus } from "@tenet-0/bus";

const bus = await Bus.connect({
  postgresUrl: process.env.TENET0_PG_URL!,
  department: "cro",
  credential: process.env.TENET0_CREDENTIAL!,
});

const eventId = await bus.publish(
  "cro.content.published",
  JSON.stringify({ title: "New drop" }),
);
await bus.close();
```

## How to bump the constitution

Edit `shared/constitution.md` and/or `shared/constitution-rules.yaml`,
then run the migrator. It creates a new version row, populates rules,
and activates — atomically, in one transaction.

```bash
# Source the password from the env file rather than pasting it inline.
set -a; source secrets/tenet0.env; set +a
export TENET0_ADMIN_URL="postgres://tenet0_admin:${POSTGRES_PASSWORD}@localhost:5432/tenet0"

bash db/migrate.sh bump-constitution \
  --prose   shared/constitution.md \
  --rules   shared/constitution-rules.yaml \
  --published-by gary
```

Outcome is one of:

| Outcome | Meaning |
|---|---|
| `Activated version N (M rules)` | New content; version N is now active |
| `No change — version N already matches` | Prose + rules SHAs unchanged; no-op |
| Error | YAML malformed, validation failed, or SP rejected — **nothing committed** |

Running agents detect the bump via `Constitution.Watch()` on their own
polling interval (default 1s minimum) and reload at the next task
boundary. Mid-task work finishes under the old version.

**Rollback** is just another forward bump: restore the prior prose/YAML
and run the migrator again. The old version row is preserved — the
audit log references every version that has ever been active.

## Credential rotation runbook

Credentials are bcrypt-hashed in `departments.credential_hash` with
optional `previous_credential_hash` + `credential_grace_until` to
support zero-downtime rotation.

**Happy path:**

1. Generate a new bearer token (high entropy, URL-safe, ≥32 bytes).
2. Connect to Postgres as the `tenet0_admin` role (admin-only is
   enforced by the connecting role, not by a token argument) and call
   `rotate_credential`:
   ```sql
   SELECT rotate_credential(
     p_department_id       => 'ops',
     p_new_credential_hash => crypt('<new-bearer>', gen_salt('bf')),
     p_grace_minutes       => 60
   );
   ```
3. Deploy the new bearer to the agent's env. The old bearer keeps
   working for 60 minutes — long enough for a rolling restart.
4. After the grace window, the old bearer is rejected with
   `ErrUnauthenticated`.

**If a credential is compromised:**

1. Set grace to 0 — rotate immediately and the old token stops working
   on the next SP call.
2. Grep the audit log for the compromised actor:
   ```sql
   SELECT * FROM audit_log WHERE actor_id = 'ops' AND recorded_at > now() - interval '1 day';
   ```
3. Decide whether the resulting activity needs reversing. Events are
   append-only; "reversing" means publishing compensating events.

## Deploying to aegis-prod

See `/mnt/f/Claude-Code-Power-Pack/skills/aegis-ssh/SKILL.md` for the
general pattern. For Tenet-0 specifically:

```bash
# 1. Sync everything except secrets/ and node_modules/
rsync -avz --exclude='secrets/' --exclude='node_modules/' --exclude='bin/' \
  -e "ssh -i ~/.ssh/ssh-key-2026-03-15" \
  tenet-0/ ubuntu@147.224.183.55:/opt/overnightdesk/tenet-0/

# 2. Generate secrets on the host (first deploy only)
ssh -i ~/.ssh/ssh-key-2026-03-15 ubuntu@147.224.183.55 \
  "cd /opt/overnightdesk/tenet-0 && bash deploy/gen-secrets.sh"

# 3. Bring up and validate
ssh -i ~/.ssh/ssh-key-2026-03-15 ubuntu@147.224.183.55 \
  "cd /opt/overnightdesk/tenet-0 && docker compose up -d && bash deploy/smoke-test.sh"

# 4. Append to /mnt/f/deploys.log
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | overnightdesk | tenet0-postgres | $(git log --oneline -1 | cut -d' ' -f1) | success | <notes>" \
  >> /mnt/f/deploys.log
```

## What is NOT in this repo

- Customer tenant data — lives in separate tenant containers; Tenet-0
  never touches customer data directly.
- Claude OAuth tokens — tenant containers hold these; Tenet-0 only sees
  token usage totals via `record_token_usage`.
- Application-layer business logic — the bus is the plumbing, not the
  product. Agents live in their own repos and speak to Tenet-0 via the
  client libraries.

## Quality gates

Every change touching library or schema code should:

- Pass `make all-tests` before commit.
- Get a `/code-review` if it's not trivial.
- Get a `/simplify` if it added new abstractions.

See `.specify/specs/49-event-bus-constitution-governor/` for the spec,
plan, and task history.
