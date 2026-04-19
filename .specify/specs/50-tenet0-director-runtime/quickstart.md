# Feature 50 — Quickstart

Validation scenarios for the Tenet-0 Director Runtime. Run against testcontainers stack during dev; against staging compose before aegis-prod; against aegis-prod itself in the smoke phase.

## Prerequisites

```bash
# 1. Feature 49 (event bus + constitution + governor) is live
docker ps | grep tenet0-postgres   # → must show "healthy"

# 2. Migrations applied
cd /mnt/f/overnightdesk/tenet-0
./db/migrate.sh                    # runs goose against tenet0-postgres
psql -h localhost -d tenet0 -c "\dn president"   # → schema "president" exists

# 3. Constitution amended (v1.1.0+) with memory_access_matrix + memory_scrubber sections
grep -A1 'memory_access_matrix' shared/constitution-rules.yaml
grep -A1 'memory_scrubber' shared/constitution-rules.yaml

# 4. Phase.dev secrets seeded
phase secrets list --app overnightdesk --env production --path /tenet-0/
# → bus credentials, MCP DSNs, comm-module token, operator pubkeys

# 5. Reference Director in place
ls /mnt/f/overnightdesk/tenet-0/agents/president.md
cmd/validate-director ./tenet-0/agents/president.md   # → exits 0

# 6. Containers runnable
docker compose --profile tenet0-runtime config | grep -E 'tenet0-(bus-watcher|healthcheck|deadline|audit-self)'
```

## Scenario 1 — Cold Start and Healthz (US-1, NFR-7)

```bash
./tenet-0/start-director-runtime.sh up -d \
  tenet0-bus-watcher tenet0-healthcheck-poller \
  tenet0-deadline-sweeper tenet0-audit-self-checker

# Verify each daemon healthy
for port in 9201 9202 9203 9204; do
  docker exec tenet0-bus-watcher curl -sf http://localhost:$port/healthz | jq .
done
# Expected per daemon: 200 OK, body { "status": "ok", "version": "...", "uptime_seconds": <small>, "dependencies": {"postgres": "ok", ...} }

# Verify lifecycle event published
docker exec tenet0-postgres psql -U bus -d tenet0 -c \
  "SELECT event_type, source FROM bus.events WHERE event_type = 'president.lifecycle.restarted' ORDER BY timestamp DESC LIMIT 1;"
# Expected: one row, source = 'president' (published by bus-watcher on cold start)
```

**Pass criteria:**
- All 4 daemons healthz returns 200 within 5 seconds of container start
- `dependencies.postgres = "ok"` for each
- `president.lifecycle.restarted` published within 5s of bus-watcher startup

## Scenario 2 — First Bus Event Flows to Zero (US-1, FR-1, FR-4, NFR-1)

```bash
# Inject a synthetic bus event
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
INSERT INTO bus.events (id, event_type, source, payload, timestamp) VALUES
  (gen_random_uuid(), 'ops.report.uptime', 'ops',
   '{\"uptime_pct\": 99.95, \"window_h\": 1}'::jsonb, now());
NOTIFY event_bus, 'ops.report.uptime';
"
sleep 5

# Verify bus-watcher routed to comm-module (check mock comm-module log in test, or comm-module's own log in staging)
docker logs overnightdesk-communication-module 2>&1 | grep '/v1/inject/zero' | tail -3

# Verify Zero received the message (check Zero's session log via tenant-0 container)
docker exec overnightdesk-tenant-0 cat /home/agentzero/.claude/sessions/latest.jsonl | grep 'BUS_EVENT' | tail -3
```

**Pass criteria:**
- comm-module shows `POST /v1/inject/zero` within 5 seconds (NFR-1)
- Zero's session log shows the framed BUS_EVENT message
- `bus_watcher_state.last_acked_event_id` advanced to the new event ID

## Scenario 3 — Zero Spawns a Director Subagent (US-2, US-3, FR-5, FR-6)

Requires at least one non-President Director in `~/.claude-agent-zero/agents/`. For testing, copy `president.md` to `test-director.md` with department=`test`.

```bash
# Inject event requiring reasoning (no matching rule)
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
INSERT INTO bus.events (id, event_type, source, payload, timestamp) VALUES
  (gen_random_uuid(), 'test.approval.requested', 'test',
   '{\"target_event_type\": \"test.action.unusual\", \"context\": \"first time pattern\"}'::jsonb, now());
NOTIFY event_bus, 'test.approval.requested';
"
sleep 30  # LLM-path budget is 60s p95

# Verify pending_approvals row reached 'decided'
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
SELECT status, decision_mode, outcome, length(rationale) as rationale_len, model_id, confidence
FROM president.pending_approvals
WHERE requesting_department = 'test'
ORDER BY received_at DESC LIMIT 1;
"

# Verify decision_log row matches
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
SELECT outcome_event_type, decision_mode, length(rationale) as rationale_len, prev_hash IS NOT NULL as has_prev_hash
FROM president.decision_log
ORDER BY created_at DESC LIMIT 1;
"

# Verify outcome event on bus
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
SELECT event_type, payload->>'decision_mode' as mode FROM bus.events
WHERE event_type LIKE 'president.%' ORDER BY timestamp DESC LIMIT 1;
"
```

**Pass criteria:**
- `pending_approvals.status = 'decided'`, `decision_mode = 'llm'`, `model_id` populated, `rationale` non-empty
- `decision_log` row has matching `outcome_event_id`, valid hash chain, non-empty rationale
- Outcome event on bus matches the recorded decision

## Scenario 4 — Director Memory Round Trip (US-3, US-4, FR-11–FR-17, NFR-5, NFR-6)

```bash
# As test director: write a memory
TEST_DIR_AUTH=$(./bin/hmac-test-helper test 1)   # generates auth header
docker exec tenet0-mcp-test director-memory-mcp <<EOF
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
  "name":"write_memory",
  "arguments":{
    "type":"pattern",
    "name":"first_pattern",
    "description":"observed test pattern",
    "body":"When event X arrives, route to handler Y."
  }
}}
EOF

# As same test director: read it back
docker exec tenet0-mcp-test director-memory-mcp <<EOF
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{
  "name":"read_memory","arguments":{"name":"first_pattern"}
}}
EOF
# Expected: body returned

# As DIFFERENT director (e.g. ops): try to read test's memory
OPS_DIR_AUTH=$(./bin/hmac-test-helper ops 1)
docker exec tenet0-mcp-test director-memory-mcp <<EOF
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{
  "name":"read_memory","arguments":{"name":"first_pattern","department":"test"}
}}
EOF
# Expected: ACCESS_DENIED error

# Verify violation event published
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
SELECT event_type, payload->>'offending_director' as offender, payload->>'target_namespace' as target
FROM bus.events
WHERE event_type = 'secops.violation.memory_access'
ORDER BY timestamp DESC LIMIT 1;
"
# Expected: row with offender=ops, target=test

# As President: cross-namespace read should succeed
PRES_DIR_AUTH=$(./bin/hmac-test-helper president 1 --signed)
docker exec tenet0-mcp-test director-memory-mcp <<EOF
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{
  "name":"search_memory","arguments":{"query":"pattern","department_filter":null}
}}
EOF
# Expected: matches across namespaces returned; audit log entry for cross-namespace read recorded
```

**Pass criteria:**
- Same-namespace read succeeds
- Cross-namespace Director read denied with `ACCESS_DENIED`
- `secops.violation.memory_access` published with correct offender + target
- President cross-read succeeds with all matches
- Cross-read audit log entry written

## Scenario 5 — PII Scrubber Catches Tenant Data (FR-15, EC-4, security T2)

```bash
# Try to write a memory containing customer email
docker exec tenet0-mcp-test director-memory-mcp <<EOF
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{
  "name":"write_memory",
  "arguments":{
    "type":"reference",
    "name":"vendor_acme",
    "body":"Acme contact: contact@acme.example.com"
  }
}}
EOF
# Expected: SCRUBBER_REJECTED error; pattern_category=customer_email

# Verify violation event
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
SELECT payload->>'pattern_category' as category, payload->>'attempted_write_name' as name
FROM bus.events
WHERE event_type = 'secops.violation.memory_pii'
ORDER BY timestamp DESC LIMIT 1;
"
# Expected: category=customer_email, name=vendor_acme; payload does NOT contain the email itself

# Try base64-encoded PII (tests Layer 2 of scrubber)
EMAIL_B64=$(echo -n 'sensitive@customer.com' | base64)
docker exec tenet0-mcp-test director-memory-mcp <<EOF
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{
  "name":"write_memory",
  "arguments":{"type":"state","name":"encoded_test","body":"data: $EMAIL_B64"}
}}
EOF
# Expected: SCRUBBER_REJECTED — Layer 2 decoded the base64 then Layer 3 caught the email
```

**Pass criteria:**
- Plaintext PII rejected; violation event has correct pattern_category
- Base64-encoded PII rejected (defense-in-depth Layer 2 + 3)
- Violation payload does NOT contain the actual content (security §1 T9)

## Scenario 6 — Operator Approval via Ed25519 Signed Decision (US-5, FR-25, security T4)

```bash
# Inject approval needing operator input
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
INSERT INTO bus.events (id, event_type, source, payload, timestamp) VALUES
  (gen_random_uuid(), 'fin.approval.requested', 'fin',
   '{\"target_event_type\":\"fin.payment.outbound\",\"target_payload\":{\"amount_cents\":5000000}}'::jsonb, now());
NOTIFY event_bus, 'fin.approval.requested';
"
sleep 10

# Verify surfacing event
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
SELECT payload->>'approval_id' as aid, payload->>'operator_nonce' as nonce
FROM bus.events
WHERE event_type = 'president.approval.surface_requested'
ORDER BY timestamp DESC LIMIT 1;
"
# Capture aid + nonce

# Simulate Gary signing approve on his device
APPROVAL_ID=<from above>
NONCE=<from above>
TS=$(date -u +%s)
BODY="{\"approval_id\":\"$APPROVAL_ID\",\"decision\":\"approve\",\"operator_nonce\":\"$NONCE\",\"timestamp\":$TS,\"reason\":\"verified vendor\"}"
SIG=$(./bin/sign-with-operator-test-key.sh "$BODY")

# Comm-module forwards signed decision to bus
docker exec overnightdesk-communication-module curl -X POST \
  http://tenet0-bus-watcher:9201/internal/operator-decision \
  -H "Content-Type: application/json" \
  -H "X-Operator-Sig: $SIG" \
  -H "Idempotency-Key: $NONCE" \
  -d "$BODY"
# Expected: 202 Accepted

sleep 2

# Verify outcome event
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
SELECT event_type, payload->>'reason' FROM bus.events
WHERE event_type = 'president.approved'
  AND payload->>'approves_event_id' = '$APPROVAL_ID'
ORDER BY timestamp DESC LIMIT 1;
"
# Expected: president.approved with operator's reason

# Replay attempt — same nonce, expect cached reply
docker exec overnightdesk-communication-module curl -X POST \
  http://tenet0-bus-watcher:9201/internal/operator-decision \
  -H "X-Operator-Sig: $SIG" \
  -H "Idempotency-Key: $NONCE" \
  -d "$BODY"
# Expected: 200 OK with `Idempotent-Replay: true` header; no new outcome event

# Bad signature — expect rejection
BAD_SIG="aaaa...$SIG"
docker exec overnightdesk-communication-module curl -X POST \
  http://tenet0-bus-watcher:9201/internal/operator-decision \
  -H "X-Operator-Sig: $BAD_SIG" \
  -d "$BODY"
# Expected: 401 Unauthorized
```

**Pass criteria:**
- Valid signed decision accepted; outcome event published within 2s
- Replay returns cached reply (idempotent)
- Bad signature rejected with 401

## Scenario 7 — Healthcheck Quarantine and Recovery (US-6, FR-18, FR-19)

```bash
# Stop one MCP binary (simulate failure)
docker exec overnightdesk-tenant-0 pkill -SIGSTOP director-memory-mcp
sleep 65   # wait for next poll cycle (60s + slack)

# Verify lifecycle.degraded published
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
SELECT payload->>'director' as dir, payload->>'failed_mcp' as mcp
FROM bus.events
WHERE event_type LIKE '%lifecycle.degraded%'
ORDER BY timestamp DESC LIMIT 5;
"
# Expected: rows naming director-memory-mcp as failed

# Verify mcp_liveness state
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
SELECT department, mcp_name, state, consecutive_failures
FROM president.mcp_liveness
WHERE mcp_name = 'director-memory-mcp';
"
# Expected: state='degraded'

# Resume MCP
docker exec overnightdesk-tenant-0 pkill -SIGCONT director-memory-mcp
sleep 65

# Verify lifecycle.recovered
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
SELECT payload->>'director' as dir FROM bus.events
WHERE event_type LIKE '%lifecycle.recovered%'
ORDER BY timestamp DESC LIMIT 1;
"
```

**Pass criteria:**
- `*.lifecycle.degraded` published within one poll cycle of MCP failure
- `mcp_liveness.state = 'degraded'` for affected (department, mcp)
- `*.lifecycle.recovered` published within one poll cycle of recovery

## Scenario 8 — Pending Approval Expires (US-7, FR-20, EC-3)

```bash
# Inject approval with short deadline (test override)
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
INSERT INTO president.pending_approvals
  (id, request_event_id, target_event_id, requesting_department, target_event_type,
   constitutional_rule_id, payload, status, operator_deadline, received_at)
VALUES
  (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'test', 'test.action.x',
   'test.requires_approval', '{}'::jsonb, 'awaiting_operator',
   now() - interval '1 minute', now() - interval '11 minutes');
"
sleep 65   # wait for sweeper

# Verify expiry
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
SELECT status, outcome FROM president.pending_approvals
WHERE requesting_department = 'test' AND target_event_type = 'test.action.x'
ORDER BY received_at DESC LIMIT 1;
"
# Expected: status='expired'

# Verify rejection event
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
SELECT payload->>'reason' FROM bus.events
WHERE event_type = 'president.rejected'
  AND payload->>'reason' = 'expired awaiting operator input'
ORDER BY timestamp DESC LIMIT 1;
"
```

**Pass criteria:**
- Sweeper transitions row to `expired` within one cycle of deadline
- `president.rejected` published with correct reason

## Scenario 9 — Audit Self-Check Catches Forged Decision (US-8, FR-21, security T7)

```bash
# Forge a president.* event WITHOUT corresponding decision_log row
# (simulates bypass of bus-side FR-2a credential check — defense-in-depth test)
docker exec tenet0-postgres psql -U postgres -d tenet0 -c "
INSERT INTO bus.events (id, event_type, source, payload, timestamp) VALUES
  (gen_random_uuid(), 'president.approved', 'president',
   '{\"approves_event_id\":\"00000000-0000-0000-0000-000000000000\",
     \"scope\":\"fin.payment.outbound\",
     \"reason\":\"FORGED FOR TEST\",
     \"decision_mode\":\"rule\",
     \"rationale\":\"forged\"}'::jsonb, now());
"
sleep 30   # wait for next 15-min cycle (test override to 30s)

# Verify violation event
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
SELECT payload->>'offending_event_id', payload->>'detection_lag_seconds'
FROM bus.events
WHERE event_type = 'secops.violation.namespace_impersonation'
ORDER BY timestamp DESC LIMIT 1;
"
```

**Pass criteria:**
- `secops.violation.namespace_impersonation` raised within one self-check cycle
- Hash chain validation still passes for all legitimate rows

## Scenario 10 — Director Lifecycle Add/Remove (US-9, FR-22, EC-12)

```bash
# Add a new Director markdown file
cp /mnt/f/overnightdesk/tenet-0/agents/president.md /tmp/test-director.md
sed -i 's/department: president/department: testdept/' /tmp/test-director.md
sed -i 's/bus_namespace: president.*/bus_namespace: testdept/' /tmp/test-director.md
# Remove operator_signature line (testdept is non-reserved)
sed -i '/operator_signature/d' /tmp/test-director.md
docker cp /tmp/test-director.md overnightdesk-tenant-0:/home/agentzero/.claude-agent-zero/agents/

sleep 10   # wait for fsnotify debounce + processing

# Verify registration event
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
SELECT payload->>'department', payload->>'file_hash'
FROM bus.events
WHERE event_type = 'testdept.lifecycle.registered'
ORDER BY timestamp DESC LIMIT 1;
"

# Verify registry row
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
SELECT department, mcp_grants FROM president.director_registry WHERE department = 'testdept';
"

# Verify memory namespace usable (write should succeed if access matrix grants testdept→testdept write)
# Note: testdept won't be in default matrix; this should fail unless matrix amended

# Remove the director
docker exec overnightdesk-tenant-0 rm /home/agentzero/.claude-agent-zero/agents/test-director.md
sleep 10

docker exec tenet0-postgres psql -U bus -d tenet0 -c "
SELECT deregistered_at FROM president.director_registry WHERE department = 'testdept';
"
# Expected: non-NULL

# Existing memory rows preserved (audit retention)
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
SELECT count(*) FROM president.director_memory WHERE department = 'testdept';
"
```

**Pass criteria:**
- Registration event within fsnotify debounce window (5s + slack)
- `director_registry` row created with correct grants and file_hash
- Removal triggers deregistration event; memory rows preserved

## Scenario 11 — Constitutional Self-Check on Deploy (NFR-9, security)

Run before first production deploy.

```bash
# 1. Verify no tenant.db imports in any binary
go build -o /dev/null ./cmd/...   # builds all 10
grep -r "tenant_db\|tenant.db\|engine/internal/tenant" tenet-0/internal/ tenet-0/cmd/
# Expected: no matches (CI-enforced)

# 2. Verify Postgres role grants
docker exec tenet0-postgres psql -U postgres -d tenet0 -c "
SELECT table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'president_app';
"
# Expected: only president.* tables, with correct INSERT-only on append-only tables

# 3. Verify distroless containers (no shell)
for d in bus-watcher healthcheck-poller deadline-sweeper audit-self-checker; do
  docker run --rm --entrypoint /bin/sh tenet0-$d 2>&1 | grep "not found"
done
# Expected: 4× "exec: /bin/sh: not found"

# 4. Verify non-root
for d in bus-watcher healthcheck-poller deadline-sweeper audit-self-checker; do
  docker exec tenet0-$d id
done
# Expected: uid=65532

# 5. Verify access matrix loads
docker exec tenet0-tenant-0 constitution-mcp <<EOF
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_memory_access_matrix"}}
EOF
# Expected: matrix returned with all 7 namespaces

# 6. Verify president.md validates
./bin/validate-director ./tenet-0/agents/president.md && echo OK
```

**Pass criteria (all required for first deploy):**
- Zero tenant imports
- Postgres grants scoped to `president` schema only with correct INSERT-only on append-only tables
- All daemon containers are distroless non-root
- Access matrix loads cleanly
- president.md validates

## Smoke Test (post-deploy on aegis-prod)

After successful production deploy, run scenarios 1, 2, 7, 9, 11. Skip scenarios 4-6, 10 (require helper binaries / mock signing in production); skip 8 (destructive timing).

If all five green: log to `/mnt/f/deploys.log`, mark deploy complete.

## References

- Spec: `.specify/specs/50-tenet0-director-runtime/spec.md`
- Plan: `.specify/specs/50-tenet0-director-runtime/plan.md`
- Contracts: `.specify/specs/50-tenet0-director-runtime/contracts/`
- Sibling Feature 49 quickstart: `.specify/specs/49-event-bus-constitution-governor/quickstart.md`
