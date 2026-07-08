from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


RISK_CLASSES = {
    "read_only",
    "reversible_write",
    "external_side_effect",
    "high_risk",
}
TOOL_KINDS = {
    "function_tool",
    "hosted_tool",
    "shell",
    "browser",
    "api",
    "message",
    "file",
    "workflow",
    "handoff",
}
AUTH_REF_KINDS = {"user_message", "task", "ticket", "memory", "policy", "manual_approval"}
SOURCE_REF_KINDS = {"file", "message", "doc", "ticket", "memory", "log", "web", "api", "policy"}
PERSISTENCE_VALUES = {"none", "temporary", "durable", "external"}
DECISION_VALUES = {"allow", "block", "revise", "escalate"}
CONFIDENCE_VALUES = {"high", "medium", "low"}
JUDGE_KINDS = {"llm", "rule", "hybrid", "human"}
CHECK_VALUES = {"pass", "fail", "uncertain", "not_applicable"}
MEMORY_USED_AS = {"instruction", "evidence", "background"}
PROVENANCE_STATUS = {"observed", "inferred", "confirmed", "imported", "generated"}
USE_POLICIES = {
    "can_use_as_instruction",
    "can_use_as_evidence",
    "requires_confirmation",
    "do_not_inject_automatically",
}
VISIBILITY_VALUES = {"personal", "project", "workspace", "org"}

UNSAFE_KEYS = {
    "raw_transcript",
    "transcript_dump",
    "model_reasoning",
    "reasoning_trace",
    "chain_of_thought",
    "full_tool_arguments",
}


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Runtime(StrictModel):
    name: str
    version: str | None = None
    adapter: str | None = None


class Actor(StrictModel):
    agent_id: str
    role: str | None = None
    provider: str | None = None
    model: str | None = None


class Tool(StrictModel):
    name: str
    kind: Literal[
        "function_tool",
        "hosted_tool",
        "shell",
        "browser",
        "api",
        "message",
        "file",
        "workflow",
        "handoff",
    ]
    target_system: str | None = None


class Action(StrictModel):
    risk_class: Literal["read_only", "reversible_write", "external_side_effect", "high_risk"]
    description: str
    target: str | None = None
    arguments_digest: str
    full_arguments_ref: str | None = None


class AuthorizationRef(StrictModel):
    kind: Literal["user_message", "task", "ticket", "memory", "policy", "manual_approval"]
    uri: str | None = None
    quote_or_summary: str
    timestamp: str | None = None


class Authorization(StrictModel):
    claimed_user_authorization: str | None = None
    user_authorization_refs: list[AuthorizationRef] = Field(default_factory=list)


class SourceRef(StrictModel):
    kind: Literal["file", "message", "doc", "ticket", "memory", "log", "web", "api", "policy"]
    uri: str | None = None
    title: str | None = None
    timestamp: str | None = None
    summary: str


class Evidence(StrictModel):
    source_refs: list[SourceRef] = Field(default_factory=list)


class ExpectedConsequence(StrictModel):
    summary: str
    external_recipients: list[str] = Field(default_factory=list)
    data_exposed: list[str] = Field(default_factory=list)
    systems_changed: list[str] = Field(default_factory=list)
    persistence: Literal["none", "temporary", "durable", "external"]


class Rollback(StrictModel):
    is_reversible: bool
    rollback_plan: str | None = None
    rollback_owner: str | None = None


class Sensitivity(StrictModel):
    contains_secret_like_data: bool
    contains_customer_data: bool
    contains_private_personal_data: bool
    contains_financial_or_legal_data: bool
    contains_production_system_access: bool


class ActionProposal(StrictModel):
    schema_version: Literal["openbrain.judge.action_proposal.v1"]
    workspace_id: str
    project_id: str | None = None
    task_id: str | None = None
    flow_id: str | None = None
    action_id: str
    idempotency_key: str
    runtime: Runtime
    actor: Actor
    tool: Tool
    action: Action
    authorization: Authorization
    evidence: Evidence
    expected_consequence: ExpectedConsequence
    rollback: Rollback
    sensitivity: Sensitivity


class Judge(StrictModel):
    kind: Literal["llm", "rule", "hybrid", "human"]
    provider: str | None = None
    model: str | None = None
    policy_version: str | None = None


class Checks(StrictModel):
    authorization_check: Literal["pass", "fail", "uncertain", "not_applicable"]
    evidence_check: Literal["pass", "fail", "uncertain", "not_applicable"]
    policy_check: Literal["pass", "fail", "uncertain", "not_applicable"]
    sensitivity_check: Literal["pass", "fail", "uncertain", "not_applicable"]
    reversibility_check: Literal["pass", "fail", "uncertain", "not_applicable"]
    quality_check: Literal["pass", "fail", "uncertain", "not_applicable"]


class RequiredRevision(StrictModel):
    summary: str | None = None
    revised_action_constraints: list[str] = Field(default_factory=list)


class Escalation(StrictModel):
    required: bool
    reason: str | None = None
    owner: str | None = None
    due_at: str | None = None


class MemoryUsed(StrictModel):
    memory_id: str
    used_as: Literal["instruction", "evidence", "background"]


class MemoryToWrite(StrictModel):
    decisions: list[str] = Field(default_factory=list)
    lessons: list[str] = Field(default_factory=list)
    failures: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)

    def has_candidates(self) -> bool:
        return any(
            (
                self.decisions,
                self.lessons,
                self.failures,
                self.constraints,
                self.open_questions,
            )
        )


class DecisionProvenance(StrictModel):
    default_status: Literal["observed", "inferred", "generated", "confirmed"]
    requires_review: bool


class JudgeDecision(StrictModel):
    schema_version: Literal["openbrain.judge.decision.v1"]
    workspace_id: str
    project_id: str | None = None
    task_id: str | None = None
    flow_id: str | None = None
    action_id: str
    decision_id: str
    proposal_id: str | None = None
    idempotency_key: str
    decision: Literal["allow", "block", "revise", "escalate"]
    reasoning_summary: str
    confidence: Literal["high", "medium", "low"]
    judge: Judge
    checks: Checks
    required_revision: RequiredRevision
    escalation: Escalation
    memory_used: list[MemoryUsed] = Field(default_factory=list)
    memory_to_write: MemoryToWrite = Field(default_factory=MemoryToWrite)
    provenance: DecisionProvenance

    @model_validator(mode="after")
    def generated_candidates_require_review(self) -> "JudgeDecision":
        if (
            self.memory_to_write.has_candidates()
            and self.provenance.default_status in {"generated", "inferred"}
            and not self.provenance.requires_review
        ):
            raise ValueError("requires_review must be true for generated or inferred memory candidates")
        return self


class RecallQuery(StrictModel):
    summary: str
    action_type: Literal["read_only", "reversible_write", "external_side_effect", "high_risk"]
    tool_name: str | None = None
    target_system: str | None = None


class RecallEntities(StrictModel):
    people: list[str] = Field(default_factory=list)
    orgs: list[str] = Field(default_factory=list)
    repos: list[str] = Field(default_factory=list)
    files: list[str] = Field(default_factory=list)
    customers: list[str] = Field(default_factory=list)
    systems: list[str] = Field(default_factory=list)
    topics: list[str] = Field(default_factory=list)


class RecallScope(StrictModel):
    visibility: Literal["personal", "project", "workspace", "org"]
    include_unconfirmed: bool = False
    include_disputed: bool = False
    include_stale: bool = False


class RecallLimits(StrictModel):
    max_items: int = Field(default=5, ge=1, le=25)
    max_tokens: int = Field(default=2000, ge=100, le=12000)
    recency_days: int | None = Field(default=None, ge=1)


class RecallPolicy(StrictModel):
    allowed_use_policies: list[
        Literal[
            "can_use_as_instruction",
            "can_use_as_evidence",
            "requires_confirmation",
            "do_not_inject_automatically",
        ]
    ] = Field(default_factory=lambda: ["can_use_as_instruction"])
    require_source_refs: bool = True


class RecallRequest(StrictModel):
    schema_version: Literal["openbrain.judge.recall.v1"]
    request_id: str
    workspace_id: str
    project_id: str | None = None
    task_id: str | None = None
    flow_id: str | None = None
    action_id: str
    query: RecallQuery
    entities: RecallEntities = Field(default_factory=RecallEntities)
    scope: RecallScope
    limits: RecallLimits = Field(default_factory=RecallLimits)
    policy: RecallPolicy = Field(default_factory=RecallPolicy)


def validate_action_proposal(value: dict[str, Any]) -> dict[str, Any]:
    _reject_unsafe_payload(value)
    return _dump_model(ActionProposal.model_validate(value))


def validate_judge_decision(value: dict[str, Any]) -> dict[str, Any]:
    _reject_unsafe_payload(value)
    return _dump_model(JudgeDecision.model_validate(value))


def validate_recall_request(value: dict[str, Any]) -> dict[str, Any]:
    _reject_unsafe_payload(value)
    return _dump_model(RecallRequest.model_validate(value))


def _dump_model(model: BaseModel) -> dict[str, Any]:
    return model.model_dump(mode="json")


def _reject_unsafe_payload(value: Any, path: str = "") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}" if path else str(key)
            if key in UNSAFE_KEYS:
                raise ValueError(f"{child_path} is not allowed in judge envelopes")
            if key == "full_arguments":
                raise ValueError("full_arguments is not allowed; use action.full_arguments_ref")
            _reject_unsafe_payload(child, child_path)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _reject_unsafe_payload(child, f"{path}[{index}]")

