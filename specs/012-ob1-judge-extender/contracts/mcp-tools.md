# MCP Contracts: OB1 Judge Extender

The first integration surface is MCP. REST endpoints may wrap these contracts later.

## `judge_recall`

Purpose: Return scoped, provenance-labeled, policy-aware memory before a judge decision.

Input:

```json
{
  "request": {
    "schema_version": "openbrain.judge.recall.v1",
    "request_id": "recall-1",
    "workspace_id": "overnightdesk",
    "project_id": "ob1-mcp",
    "task_id": "task-123",
    "flow_id": "flow-123",
    "action_id": "act-123",
    "query": {
      "summary": "Agent wants to open a PR with a production config change",
      "action_type": "external_side_effect",
      "tool_name": "github.create_pull_request",
      "target_system": "github"
    },
    "entities": {
      "people": [],
      "orgs": ["LittleTownLabs"],
      "repos": ["overnightdesk"],
      "files": ["ob1-mcp/src/server.py"],
      "customers": [],
      "systems": ["ob1-mcp"],
      "topics": ["judge", "memory"]
    },
    "scope": {
      "visibility": "project",
      "include_unconfirmed": false,
      "include_disputed": false,
      "include_stale": false
    },
    "limits": {
      "max_items": 5,
      "max_tokens": 2000,
      "recency_days": 180
    },
    "policy": {
      "allowed_use_policies": ["can_use_as_instruction"],
      "require_source_refs": true
    }
  }
}
```

Output:

```json
{
  "schema_version": "openbrain.judge.recall_response.v1",
  "request_id": "recall-1",
  "memories": [
    {
      "memory_id": "42",
      "summary": "Use OB1 as continuity layer, not runtime",
      "content": "OB1 stores recall and decision events; runtimes execute.",
      "source": {
        "kind": "manual_entry",
        "uri": "docs/ob1-judge-extender-process.md",
        "title": "OB1 Judge Extender Process",
        "timestamp": "2026-07-08T00:00:00Z"
      },
      "provenance": {
        "status": "confirmed",
        "confidence": 1.0,
        "created_by": "user",
        "model": null,
        "runtime": "codex"
      },
      "use_policy": {
        "policy": "can_use_as_instruction",
        "reason": "human confirmed"
      },
      "freshness": {
        "created_at": "2026-07-08T00:00:00Z",
        "last_confirmed_at": "2026-07-08T00:00:00Z",
        "stale_after": null
      },
      "scope": {
        "workspace_id": "overnightdesk",
        "project_id": "ob1-mcp",
        "visibility": "project"
      }
    }
  ],
  "policy_hits": [],
  "warnings": []
}
```

Validation:

- Reject unknown action types and use policies.
- Default `allowed_use_policies` to `["can_use_as_instruction"]`.
- Exclude inactive and superseded memories unless explicitly requested for inspection.

## `save_action_proposal`

Purpose: Store a schema-validated action proposal idempotently.

Input:

```json
{
  "proposal": {
    "schema_version": "openbrain.judge.action_proposal.v1",
    "workspace_id": "overnightdesk",
    "project_id": "ob1-mcp",
    "task_id": "task-123",
    "flow_id": "flow-123",
    "action_id": "act-123",
    "idempotency_key": "proposal-act-123-v1",
    "runtime": {
      "name": "codex",
      "version": null,
      "adapter": "local-harness"
    },
    "actor": {
      "agent_id": "codex",
      "role": "coding-agent",
      "provider": "openai",
      "model": "gpt-5"
    },
    "tool": {
      "name": "github.create_pull_request",
      "kind": "api",
      "target_system": "github"
    },
    "action": {
      "risk_class": "external_side_effect",
      "description": "Open a PR for judge recall validation",
      "target": "github:LittleTownLabs/overnightdesk",
      "arguments_digest": "sha256:example",
      "full_arguments_ref": null
    },
    "authorization": {
      "claimed_user_authorization": "User asked to proceed",
      "user_authorization_refs": [
        {
          "kind": "user_message",
          "uri": null,
          "quote_or_summary": "proceed",
          "timestamp": "2026-07-08T00:00:00Z"
        }
      ]
    },
    "evidence": {
      "source_refs": [
        {
          "kind": "file",
          "uri": "docs/ob1-judge-extender-process.md",
          "title": "OB1 Judge Extender Process",
          "timestamp": "2026-07-08T00:00:00Z",
          "summary": "Process seed for judge extender"
        }
      ]
    },
    "expected_consequence": {
      "summary": "Creates a public PR for review",
      "external_recipients": [],
      "data_exposed": [],
      "systems_changed": ["github"],
      "persistence": "external"
    },
    "rollback": {
      "is_reversible": true,
      "rollback_plan": "Close PR or revert branch",
      "rollback_owner": "operator"
    },
    "sensitivity": {
      "contains_secret_like_data": false,
      "contains_customer_data": false,
      "contains_private_personal_data": false,
      "contains_financial_or_legal_data": false,
      "contains_production_system_access": false
    }
  }
}
```

Validation:

- Reject missing required identity fields.
- Reject unsupported `tool.kind`, `risk_class`, source reference kind, authorization kind, and persistence enum values.
- Reject raw transcript, model reasoning trace, or full unreferenced tool argument dumps.

## `record_judge_decision`

Purpose: Store a schema-validated judge decision idempotently.

Input:

```json
{
  "decision": {
    "schema_version": "openbrain.judge.decision.v1",
    "workspace_id": "overnightdesk",
    "project_id": "ob1-mcp",
    "task_id": "task-123",
    "flow_id": "flow-123",
    "action_id": "act-123",
    "decision_id": "dec-123",
    "proposal_id": "act-123",
    "idempotency_key": "decision-act-123-v1",
    "decision": "revise",
    "reasoning_summary": "Evidence is sufficient but target scope must be narrowed.",
    "confidence": "medium",
    "judge": {
      "kind": "hybrid",
      "provider": null,
      "model": null,
      "policy_version": "judge-v1"
    },
    "checks": {
      "authorization_check": "pass",
      "evidence_check": "pass",
      "policy_check": "pass",
      "sensitivity_check": "pass",
      "reversibility_check": "pass",
      "quality_check": "uncertain"
    },
    "required_revision": {
      "summary": "Narrow PR to validation only",
      "revised_action_constraints": ["No production deploy"]
    },
    "escalation": {
      "required": false,
      "reason": null,
      "owner": null,
      "due_at": null
    },
    "memory_used": [
      {
        "memory_id": "42",
        "used_as": "instruction"
      }
    ],
    "memory_to_write": {
      "decisions": ["OB1 judge extender should start MCP-first"],
      "lessons": ["Validate contracts before adding adapters"],
      "failures": [],
      "constraints": ["Generated lessons require review"],
      "open_questions": []
    },
    "provenance": {
      "default_status": "generated",
      "requires_review": true
    }
  }
}
```

Validation:

- `decision` must be `allow`, `block`, `revise`, or `escalate`.
- `confidence` must be `high`, `medium`, or `low`.
- Check values must be `pass`, `fail`, `uncertain`, or `not_applicable`.
- Generated or inferred `memory_to_write` must set `requires_review=true`.

## `list_review_queue`

Purpose: List pending or filtered review candidates.

Input:

```json
{
  "workspace_id": "overnightdesk",
  "project_id": "ob1-mcp",
  "status": "pending",
  "limit": 20
}
```

Output:

```json
{
  "items": [
    {
      "candidate_id": "rc-123",
      "source_decision_id": "dec-123",
      "candidate_kind": "lesson",
      "proposed_content": "Validate contracts before adding adapters",
      "provenance_status": "generated",
      "suggested_use_policy": "requires_confirmation",
      "review_status": "pending",
      "review_priority": "normal",
      "created_at": "2026-07-08T00:00:00Z"
    }
  ]
}
```

## `review_memory_candidate`

Purpose: Apply a review action to one candidate.

Input:

```json
{
  "candidate_id": "rc-123",
  "action": "evidence_only",
  "reviewer": "gary",
  "note": "Useful history, not a standing instruction",
  "edited_content": null,
  "new_use_policy": "can_use_as_evidence",
  "new_scope": "project"
}
```

Validation:

- Action must be one of `confirm`, `edit`, `evidence_only`, `restrict_scope`, `mark_stale`, `reject`, `dispute`, or `supersede`.
- `confirm` creates or updates a memory entry through the same guard path used by memory writes.
- Non-confirming actions must not create instruction-grade memory.

## `inspect_memory`

Purpose: Explain one memory and its eligibility for future judge use.

Input:

```json
{
  "memory_id": 42
}
```

Output:

```json
{
  "memory": {
    "id": 42,
    "content": "OB1 stores recall and decision events; runtimes execute.",
    "provenance": "confirmed",
    "use_policy": "can_use_as_instruction",
    "is_active": true
  },
  "source": {
    "kind": "manual_entry",
    "uri": "docs/ob1-judge-extender-process.md"
  },
  "created_by_decision": null,
  "used_by_decisions": [
    {
      "decision_id": "dec-123",
      "used_as": "instruction"
    }
  ],
  "review": null,
  "warnings": [],
  "automatic_injection_eligible": true
}
```
