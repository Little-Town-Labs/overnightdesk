# Research: OB1 Judge Extender

## Decision: Use existing MCP tools as the first integration surface

**Rationale**: `ob1-mcp` already exposes memory tools and the first judge write-back tools over MCP. Extending the MCP surface keeps the implementation close to deployed clients and avoids introducing a second API surface before the contract is stable.

**Alternatives considered**:

- REST-first implementation: useful later for non-MCP consumers, but it would duplicate auth, validation, and routing before the core contract is proven.
- Runtime-specific adapter first: would validate one runtime quickly but risks baking OpenClaw, Hermes, or Codex assumptions into OB1 core.

## Decision: Keep OB1 as continuity layer, not judge or runtime

**Rationale**: OB1 should recall scoped memory, store compact decisions, manage review, and support inspection. Runtimes own execution; judges own allow/block/revise/escalate decisions.

**Alternatives considered**:

- Put judge logic inside OB1: rejected because judge engines may be LLM, rule, hybrid, or human and should remain swappable.
- Put orchestration inside OB1: rejected because Hermes, OpenClaw, Codex, and future runtimes already own sessions, tools, queues, and handoffs.

## Decision: Add validation models in `ob1-mcp`

**Rationale**: Current helper extraction validates only a few required fields. The feature needs boundary validation for enums, required nested fields, retention rules, and unsafe payload rejection before storing JSONB.

**Alternatives considered**:

- Continue loose JSONB storage: rejected because future recall, review, and inspector behavior depends on consistent shapes.
- Database-only validation: useful for invariant columns, but too coarse for nested contract semantics and unsafe payload checks.

## Decision: Add DB-backed review queue records

**Rationale**: Review candidates need durable status, reviewer action history, scope changes, and links back to source decisions. Deriving the queue only from `judge_decisions.memory_to_write` would make review state hard to track.

**Alternatives considered**:

- Derived queue only: acceptable for a spike, but not enough for confirm/edit/restrict/reject/supersede behavior.
- Store review state in memory entries only: rejected because candidates should not always become memory entries before review.

## Decision: Inspector starts as an MCP read path

**Rationale**: The operator trust surface is primarily data assembly: memory, source, decision usage, review status, supersession, and warnings. MCP read paths can provide this before any UI or REST wrapper exists.

**Alternatives considered**:

- UI-first inspector: useful later, but premature before the underlying read model is stable.
- Log-only inspection: rejected because operators need structured, queryable provenance, not ad hoc logs.

## Decision: Use local golden harnesses before production adapters

**Rationale**: Code Review Memory and TaskFlow Work Log fixtures can prove the contracts without touching live production systems. This lowers rollout risk and gives future runtime adapters a stable baseline.

**Alternatives considered**:

- Production Hermes adapter first: higher value operationally, but unsafe until validation and review gating are proven.
- OpenClaw adapter first: matches the guide, but there is not yet a local OpenClaw runtime in this repo.
