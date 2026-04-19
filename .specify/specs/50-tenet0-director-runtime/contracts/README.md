# Feature 50 — Tenet-0 Director Runtime: Contracts Index

This directory contains the authoritative machine-readable contracts for the
Tenet-0 Director Runtime. Implementations in any language MUST conform to
these schemas; deviations are spec violations, not preference debates.

All contracts are versioned independently. **A contract version bumps when
the FR/NFR it implements changes.** A schema field rename or removal is a
major version bump (breaking); a field addition with `additionalProperties:
false` already in place is a minor version bump.

## Files

### `president-events.yaml`
JSON Schema (draft 2020-12) for every event the President, the four daemons,
and the six MCP servers **publish** to the Feature 49 bus, plus the catalog
of events this feature **consumes**. Every payload includes `decision_mode`
and `rationale` per spec FR-5; SecOps violation payloads NEVER carry the
offending content. Inherits the Feature 49 envelope (FR-1) and conforms to
FR-2 namespacing, FR-11a approval format, FR-12 causality.

- **Read by:** Feature 49 bus validator at publish time; SecOps Auditor
  (Feature 57) at audit time; downstream Directors (Features 52-56) when
  consuming `president.*` outcomes.
- **Written by:** This feature's authors. Future contributors who add a new
  `president.*` event MUST add its schema here in the same PR.
- **Bumps when:** A new published/consumed event is added, or a payload
  field is added/removed/renamed.

### `mcp-tool-contracts.yaml`
Per-MCP-server tool surface (6 servers, ~30 tools total). Compatible with
the MCP `tools/list` shape (`name`, `description`, `inputSchema`) plus
`outputSchema` and `errorCodes` for code generation and contract testing.
Mutating tools accept idempotency keys. Errors use the uniform `{error,
code, details?}` envelope; internal stack traces never reach callers.

- **Read by:** Claude Code subagents (the President and future Directors)
  at MCP discovery time; integration tests; code generators producing typed
  client stubs.
- **Written by:** This feature's MCP authors. Adding a tool or changing a
  signature MUST land here first, then the implementation.
- **Bumps when:** A tool is added/removed, or any input/output schema or
  error code list changes.

### `director-markdown-contract.yaml`
Schema validating the structure of every Director `.md` file in
`~/.claude-agent-zero/agents/`: required YAML frontmatter, required H2 body
sections, canonical Memory Protocol footer regex. The reference example
(FR-24) for `president.md` is included inline for golden-file testing.

- **Read by:** The lifecycle validator (invoked by `tenet0-bus-watcher`'s
  file-system watcher per OQ-1); CI as a contract test on `president.md`
  and any future Director markdown shipped in this repo.
- **Written by:** This feature's contract owner. Future Director authors
  (Features 52-57) reuse this contract unchanged; they do NOT extend it
  per Director.
- **Bumps when:** A required frontmatter field or body section is added,
  removed, or renamed; the canonical Memory Protocol regex changes.

### `daemon-internal-http.yaml`
OpenAPI 3.1 spec for the daemon-internal HTTP endpoints beyond `/healthz`
and `/metrics`. Today this is one endpoint on `tenet0-bus-watcher` —
`POST /internal/operator-decision` — which receives operator-signed Ed25519
decisions forwarded by comm-module and converts them into bus events. Plus
a `POST /internal/lifecycle/rescan` to bypass the fsnotify debounce.
Bridge-only; no public exposure.

- **Read by:** comm-module (operator-decision forwarding); operator runbook
  for manual rescan trigger; integration tests.
- **Written by:** This feature's daemon authors. New internal endpoints
  added to other daemons land here too.
- **Bumps when:** An endpoint is added, a request/response shape changes,
  or an error code is added.

### `daemon-health-contracts.yaml`
`/healthz` response shape and complete Prometheus metrics catalog for the
four daemons (`tenet0-bus-watcher`, `tenet0-healthcheck-poller`,
`tenet0-deadline-sweeper`, `tenet0-audit-self-checker`) plus the MCP-emitted
metrics catalogued for completeness. Stable port assignments per daemon
(9201-9204) for operator runbook reference.

- **Read by:** Prometheus scrape config; Grafana dashboards; the SecurityCouncil
  uptime checker; operator runbooks.
- **Written by:** Daemon authors when adding a new metric or dependency
  check. New metrics MUST land here before the code that emits them.
- **Bumps when:** A daemon's port changes, a `/healthz` field is added, a
  metric is added/removed/renamed, or a metric's label set changes
  (label-set changes break dashboards).

## Cross-References

- **Feature 49 (`event-bus-constitution-governor`)** is the foundational
  contract every event here builds on. When this directory references
  "FR-X", "NFR-X", or "FR-Xa", the prefix-less number refers to **this
  feature's** spec; cross-feature references use full names ("Feature 49
  FR-2a", "Feature 49 FR-11a", etc.).
- **Feature 58 (`platform-orchestrator`)** contracts at
  `/mnt/f/overnightdesk-engine/.specify/specs/58-platform-orchestrator/contracts/`
  set the YAML house style this directory follows.

## Validation

These files are validated at CI time:

1. `president-events.yaml` → `ajv validate` against draft 2020-12 meta-schema.
2. `mcp-tool-contracts.yaml` → same plus a custom validator confirming every
   tool's `inputSchema` and `outputSchema` are themselves valid JSON Schema.
3. `director-markdown-contract.yaml` → applied by Go validator against the
   reference `president.md` shipped in this feature; golden-file test must
   pass before merge.
4. `daemon-health-contracts.yaml` → custom validator confirming every metric
   name matches the `^tenet0_[a-z][a-z0-9_]*$` pattern and every daemon has
   exactly one port assignment.
