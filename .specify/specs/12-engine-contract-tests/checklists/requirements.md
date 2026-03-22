# Requirements Checklist — Feature 12: Platform↔Engine Contract Tests

## Bug Fixes
- [ ] WebSocket URL uses `/api/terminal` (not `/api/terminal/ws`)
- [ ] Heartbeat PUT sends `interval_seconds` to engine (not `intervalSeconds`)
- [ ] Heartbeat GET returns camelCase to dashboard (not snake_case)
- [ ] Engine Message struct has JSON tags (snake_case serialization)
- [ ] Job list renders `created_at` timestamps
- [ ] Dashboard status reads nested `queue.queue_depth` and `heartbeat.last_run`
- [ ] Bridge reconfig detection checks `enabled` not `bot_token`

## Contract Types
- [ ] `engine-contracts.ts` defines interfaces for all engine JSON responses
- [ ] Interfaces use snake_case matching actual engine output
- [ ] Covers: jobs, conversations, messages, heartbeat, status, auth-status, telegram, discord, terminal ticket, logs

## Contract Tests
- [ ] All 16 engine-client functions tested with real engine shapes
- [ ] Proxy route tests verify heartbeat camel↔snake transformation
- [ ] Proxy route tests verify terminal wsUrl format
- [ ] Snapshot tests for each contract fixture
- [ ] Error cases tested (network failure, non-ok response)

## Component Tests
- [ ] HeartbeatForm renders with camelCase config after proxy transform
- [ ] JobList renders with snake_case job data
- [ ] ActivityList renders messages with snake_case fields

## Verification
- [ ] All existing tests still pass (501+)
- [ ] New contract + component tests pass
- [ ] `npm run build` succeeds
- [ ] Engine `go test ./...` passes after Message struct fix
- [ ] 80%+ coverage on changed files
