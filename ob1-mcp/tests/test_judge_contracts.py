import pytest

from src.judge_contracts import (
    validate_action_proposal,
    validate_judge_decision,
    validate_recall_request,
)


def valid_action_proposal(**overrides):
    proposal = {
        "schema_version": "openbrain.judge.action_proposal.v1",
        "workspace_id": "ws",
        "project_id": "ob1-mcp",
        "task_id": "task-1",
        "flow_id": "flow-1",
        "action_id": "act-1",
        "idempotency_key": "proposal-act-1",
        "runtime": {"name": "codex", "version": None, "adapter": "local"},
        "actor": {
            "agent_id": "codex",
            "role": "coding-agent",
            "provider": "openai",
            "model": "gpt-5",
        },
        "tool": {
            "name": "github.create_pull_request",
            "kind": "api",
            "target_system": "github",
        },
        "action": {
            "risk_class": "external_side_effect",
            "description": "Open a pull request",
            "target": "github:repo",
            "arguments_digest": "sha256:abc123",
            "full_arguments_ref": None,
        },
        "authorization": {
            "claimed_user_authorization": "User said proceed",
            "user_authorization_refs": [
                {
                    "kind": "user_message",
                    "uri": None,
                    "quote_or_summary": "proceed",
                    "timestamp": "2026-07-08T00:00:00Z",
                }
            ],
        },
        "evidence": {
            "source_refs": [
                {
                    "kind": "file",
                    "uri": "docs/ob1-judge-extender-process.md",
                    "title": "OB1 Judge Extender Process",
                    "timestamp": "2026-07-08T00:00:00Z",
                    "summary": "Process note",
                }
            ]
        },
        "expected_consequence": {
            "summary": "Creates a public pull request",
            "external_recipients": [],
            "data_exposed": [],
            "systems_changed": ["github"],
            "persistence": "external",
        },
        "rollback": {
            "is_reversible": True,
            "rollback_plan": "Close the PR",
            "rollback_owner": "operator",
        },
        "sensitivity": {
            "contains_secret_like_data": False,
            "contains_customer_data": False,
            "contains_private_personal_data": False,
            "contains_financial_or_legal_data": False,
            "contains_production_system_access": False,
        },
    }
    proposal.update(overrides)
    return proposal


def valid_judge_decision(**overrides):
    decision = {
        "schema_version": "openbrain.judge.decision.v1",
        "workspace_id": "ws",
        "project_id": "ob1-mcp",
        "task_id": "task-1",
        "flow_id": "flow-1",
        "action_id": "act-1",
        "decision_id": "dec-1",
        "proposal_id": "act-1",
        "idempotency_key": "decision-act-1",
        "decision": "revise",
        "reasoning_summary": "Narrow the action before proceeding.",
        "confidence": "medium",
        "judge": {
            "kind": "hybrid",
            "provider": None,
            "model": None,
            "policy_version": "judge-v1",
        },
        "checks": {
            "authorization_check": "pass",
            "evidence_check": "pass",
            "policy_check": "pass",
            "sensitivity_check": "pass",
            "reversibility_check": "pass",
            "quality_check": "uncertain",
        },
        "required_revision": {
            "summary": "No production deploy",
            "revised_action_constraints": ["docs only"],
        },
        "escalation": {
            "required": False,
            "reason": None,
            "owner": None,
            "due_at": None,
        },
        "memory_used": [{"memory_id": "42", "used_as": "instruction"}],
        "memory_to_write": {
            "decisions": [],
            "lessons": ["Validate contracts before adapters"],
            "failures": [],
            "constraints": ["Generated lessons require review"],
            "open_questions": [],
        },
        "provenance": {"default_status": "generated", "requires_review": True},
    }
    decision.update(overrides)
    return decision


def valid_recall_request(**overrides):
    request = {
        "schema_version": "openbrain.judge.recall.v1",
        "request_id": "recall-1",
        "workspace_id": "ws",
        "project_id": "ob1-mcp",
        "task_id": "task-1",
        "flow_id": "flow-1",
        "action_id": "act-1",
        "query": {
            "summary": "Agent wants to open a PR",
            "action_type": "external_side_effect",
            "tool_name": "github.create_pull_request",
            "target_system": "github",
        },
        "entities": {
            "people": [],
            "orgs": [],
            "repos": ["overnightdesk"],
            "files": ["ob1-mcp/src/server.py"],
            "customers": [],
            "systems": ["ob1-mcp"],
            "topics": ["judge"],
        },
        "scope": {
            "visibility": "project",
            "include_unconfirmed": False,
            "include_disputed": False,
            "include_stale": False,
        },
        "limits": {"max_items": 5, "max_tokens": 2000, "recency_days": 180},
        "policy": {
            "allowed_use_policies": ["can_use_as_instruction"],
            "require_source_refs": True,
        },
    }
    request.update(overrides)
    return request


def test_validate_action_proposal_accepts_full_contract():
    payload = validate_action_proposal(valid_action_proposal())
    assert payload["action"]["risk_class"] == "external_side_effect"
    assert payload["tool"]["kind"] == "api"


def test_validate_action_proposal_rejects_unknown_risk_class():
    proposal = valid_action_proposal(action={**valid_action_proposal()["action"], "risk_class": "spicy"})
    with pytest.raises(ValueError, match="risk_class"):
        validate_action_proposal(proposal)


def test_validate_action_proposal_rejects_raw_transcript_payloads():
    proposal = valid_action_proposal(raw_transcript="full chat dump")
    with pytest.raises(ValueError, match="raw_transcript"):
        validate_action_proposal(proposal)


def test_validate_action_proposal_rejects_full_arguments_without_ref():
    proposal = valid_action_proposal(full_arguments={"body": "too much"})
    with pytest.raises(ValueError, match="full_arguments"):
        validate_action_proposal(proposal)


def test_validate_judge_decision_accepts_full_contract():
    payload = validate_judge_decision(valid_judge_decision())
    assert payload["decision"] == "revise"
    assert payload["checks"]["quality_check"] == "uncertain"


def test_validate_judge_decision_rejects_unknown_decision():
    with pytest.raises(ValueError, match="decision"):
        validate_judge_decision(valid_judge_decision(decision="maybe"))


def test_validate_judge_decision_requires_review_for_generated_memory_candidates():
    decision = valid_judge_decision(
        provenance={"default_status": "generated", "requires_review": False}
    )
    with pytest.raises(ValueError, match="requires_review"):
        validate_judge_decision(decision)


def test_validate_recall_request_defaults_to_instruction_use_policy():
    request = valid_recall_request(policy={"require_source_refs": True})
    payload = validate_recall_request(request)
    assert payload["policy"]["allowed_use_policies"] == ["can_use_as_instruction"]


def test_validate_recall_request_rejects_unknown_use_policy():
    request = valid_recall_request(
        policy={"allowed_use_policies": ["whatever"], "require_source_refs": True}
    )
    with pytest.raises(ValueError, match="allowed_use_policies"):
        validate_recall_request(request)
