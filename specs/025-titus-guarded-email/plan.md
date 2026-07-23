# Implementation Plan: Titus Guarded Outbound Email

**Branch**: `agent/codex/titus-guarded-email` | **Date**: 2026-07-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/025-titus-guarded-email/spec.md`

## Summary

Contain the incident first by restricting Titus's hosted AgentMail MCP
connection to an exact read-only allowlist. Then add a local stdio MCP boundary
with one preparation tool and one approval-bound send tool. The guarded sender
validates the immutable draft, rechecks a short-lived signed approval token,
screens the complete subject/body and target through SecurityTeam, sends to
AgentMail with a provider-supported idempotency key, retrieves the provider
record, and returns success only after exact normalized comparison. A
content-free SQLite attempt ledger in the retained Titus volume prevents a
later retry from becoming a new logical send. Rollback returns Titus to the
contained read-only state.

## Technical Context

**Language/Version**: Python 3.11+ inside Hermes Agent 0.18.0-coder; Bash for repository-owned Aegis deployment and qualification; YAML for Hermes MCP configuration

**Primary Dependencies**: Hermes Agent MCP client/filter configuration; official MCP Python SDK FastMCP already installed in the runtime; Python standard library HTTP, HMAC, JSON, email-address, and SQLite modules; AgentMail REST API; SecurityTeam HTTP API

**Storage**: Existing protected Phase runtime path plus a content-free SQLite guarded-send attempt ledger under the retained `hermes-titus-data` volume; no platform or SecurityTeam schema change

**Testing**: Python `unittest` small/medium tests with fake SecurityTeam and AgentMail transports; shell filesystem/configuration contracts; existing Titus qualification; MCP tool discovery; private Aegis failure-path checks; one owner-approved provider readback test

**Target Platform**: ARM64 `aegis-prod`, hardened rootless-style `hermes-titus` container on `overnightdesk_overnightdesk`, with no published ports

**Project Type**: Existing tenant runtime source with a local stdio MCP server and external REST integrations

**Performance Goals**: Reject invalid drafts before network I/O; bound each SecurityTeam and AgentMail request to 15 seconds; complete normal screening, send, and readback in under 45 seconds

**Constraints**: Fail closed; no direct AgentMail mutation tools; no content in logs or state; no secrets in source/tool arguments/Docker metadata; no automatic duplicate after ambiguity; exact Titus inbox only; no attachments/CC/BCC/reply/forward/draft mutations in the first release; Titus-only restart; Feature 024 remains paused

**Scale/Scope**: One Titus runtime, one hosted read-only AgentMail connection, one local guarded sender with two MCP tools, one SecurityTeam service call, and one retained local attempt ledger

## Constitution Check

_GATE: Passed before research and re-checked after design._

- **Customer data is sacred — PASS**: Email content crosses only the existing
  SecurityTeam and AgentMail boundaries required for screening and delivery.
  Local state stores attempt metadata and provider IDs, never recipients,
  subject, or body.
- **Security — PASS**: Direct excessive agency is removed. External and model
  input is validated, credentials remain Phase-injected, screening and provider
  responses are untrusted, every network failure is bounded, and delivery fails
  closed.
- **Owner decides — PASS**: A short-lived signed token binds the exact prepared
  draft, but the skill still requires explicit owner approval immediately
  before the destructive tool call. A changed draft needs a new token and
  approval.
- **Simple over clever — PASS**: The design uses one local MCP boundary, the
  existing SecurityTeam endpoint, AgentMail's documented REST endpoints and
  idempotency header, and SQLite already included with Python.
- **Honesty — PASS**: Provider acceptance is an intermediate state. Only exact
  provider readback returns `verified_sent`; mismatch returns
  `ambiguous_unverified`.
- **Owner time — PASS**: Preparation returns one stable fingerprint for review,
  and a verified retry returns the original result instead of sending again.
- **Platform quality — PASS**: Containment, timeout, denial, ambiguity,
  persistence, restart, rollback, and owner acceptance are explicit gates.
- **Test-first — PASS**: The empty-content defect, direct mutation exposure,
  security failures, provider mismatch, and duplicate retry are RED tests
  before implementation.
- **Cross-repository/runtime consistency — PASS**: The platform standard,
  production-mounted standard, Ops knowledge loader, and deployment ledger are
  required closeout surfaces.
- **Secrets — PASS**: Titus receives the existing SecurityTeam caller value
  through its exact protected Phase path. No secret value enters Git, command
  output, MCP arguments, logs, SQLite, or deployment evidence.

## Phase 0 Research Decisions

See [research.md](research.md).

1. Hosted AgentMail remains the read-only mailbox interface because Hermes
   supports an exact per-server tool include list.
2. A local stdio MCP process is the mutation boundary because it can make an
   incomplete provider schema impossible to invoke while keeping credentials
   inside the Titus process boundary.
3. Preparation and sending are separate tools. Preparation is read-only and
   produces a short-lived HMAC-signed approval token over the exact canonical
   draft plus a random logical-send nonce. Sending is the sole mutating tool.
4. SecurityTeam `/check-outbound` is the required scan. The request carries the
   exact target plus a deterministic canonical representation of subject, text,
   and HTML. Only HTTP 200, explicit `allowed: true`, and byte-equal returned
   content pass.
5. AgentMail's `Idempotency-Key` header is derived from the signed logical-send
   identity. A retry with the same approval returns the original message rather
   than delivering a duplicate.
6. AgentMail `GET message` is the authority for recipient, subject, text, HTML,
   sent label, inbox, message ID, and thread ID verification.
7. A content-free SQLite state machine prevents a stale or ambiguous attempt
   from becoming a new send after the provider's 24-hour idempotency window.

## Phase 1 Design

### Containment

The hosted `agentmail` server receives an exact include list containing eight
read-only tools:

- `list_inboxes`
- `get_inbox`
- `list_threads`
- `search_threads`
- `get_thread`
- `list_messages`
- `search_messages`
- `get_attachment`

Every mutation tool is absent by construction. Qualification parses the YAML
and compares the allowlist exactly so dependency drift cannot silently restore
authority.

### Canonical draft and approval token

The preparation boundary accepts one exact Titus inbox, one to ten unique bare
email addresses, subject, optional text, and optional HTML. It rejects all
other envelope features. The canonical draft preserves subject/body bytes
except for CRLF-to-LF comparison normalization and lowercases/sorts normalized
recipient addresses.

The tool returns:

- an opaque approval token containing version, issued time, random nonce, and
  draft digest, signed with a purpose-derived key;
- a non-secret fingerprint suitable for the owner confirmation;
- the exact normalized recipients, subject, and body for presentation.

The token expires after 30 minutes. The send boundary verifies signature,
expiry, exact draft digest, and exact Titus inbox before any network I/O.
Tokens are not logged or persisted.

### SecurityTeam screening

The send boundary posts:

```json
{
  "kind": "send_email",
  "targetId": "<normalized recipient set>",
  "channel": "dm",
  "content": "<canonical subject and body representation>"
}
```

The target and content are the exact approved draft, not a summary. Any
non-200 response, timeout, transport failure, invalid JSON, missing boolean
allow field, denial, or changed returned content stops before AgentMail.

### Idempotent send and provider readback

Before sending, an exclusive SQLite transaction reserves the logical-send
nonce and draft digest. It records only:

- logical send ID;
- draft digest;
- provider idempotency key;
- state and safe error code;
- provider message/thread IDs when known;
- created and updated timestamps.

The provider request supplies exact recipients, subject, text when present, and
HTML when present. It never supplies unsupported fields. A bounded send
response must contain both identifiers.

Readback uses the exact Titus inbox and returned message ID. Comparison requires
the exact inbox/message/thread identities, sent label, normalized recipient
set, subject, and each supplied body representation. Exact match transitions
to `verified_sent`. Missing or mismatched readback transitions to
`ambiguous_unverified`. The same token may reconcile with the same idempotency
key within 24 hours; after that window, an unverified attempt is refused rather
than resent.

### Logging and response contract

The MCP process writes structured stage, outcome, safe error code, and local
attempt ID to stderr only. It never logs the approval token, draft digest,
provider body, recipient, subject, text, HTML, or credential.

The mutating tool returns only:

- `verified_sent` plus message/thread IDs; or
- a safe failure/ambiguous status and next action.

It never returns provider response bodies or exception strings.

### Runtime and rollback

`prepare-volume.sh` installs the local MCP source and creates the content-free
state directory in the retained Titus volume. `load-phase-env.sh` admits and
requires `SECURITY_SERVICE_TOKEN` only in the exact Titus runtime Phase path.
The Docker container still receives secrets only from the mode-0440 runtime
file, publishes no port, and retains its existing hardening.

Activation adds the local server after its private qualification. Rollback
removes the local guarded server configuration but retains the hosted read-only
allowlist and state database. Only `hermes-titus.service` may restart.

## Project Structure

### Documentation (this feature)

```text
specs/025-titus-guarded-email/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── guarded-email.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
tenants/hermes-titus/
├── config/config.yaml
├── mcp-servers/guarded-agentmail/
│   ├── guarded_email.py
│   ├── server.py
│   └── tests/test_guarded_email.py
├── runtime/
│   ├── load-phase-env.sh
│   ├── prepare-volume.sh
│   └── start-with-secrets.sh
├── scripts/
│   ├── deploy-aegis.sh
│   └── qualify.sh
├── skills/agentmail-email/SKILL.md
└── README.md
```

**Structure Decision**: Keep mailbox reads on the provider-hosted MCP server,
but move the only allowed external email mutation into a repository-owned
Titus-local stdio MCP process. This preserves one runtime and secret boundary
while enforcing validation, screening, idempotency, and verification in code.

## Delivery Increments

1. **Containment**: exact hosted read-only allowlist, RED/GREEN qualification,
   skill/README update, review, merge, deploy, and live tool enumeration.
2. **Guarded core**: RED tests for validation, approval binding,
   SecurityTeam failures, provider responses, readback, and retry state;
   implement the pure service and state machine.
3. **MCP/runtime integration**: expose preparation and send tools, install
   source, bind the protected SecurityTeam token, and extend qualification.
4. **Production qualification**: private activation, failure matrix, restart
   persistence, one owner-approved harmless test send, exact provider readback,
   observation, and read-only rollback rehearsal.
5. **Closeout**: standard/WHY/WHO synchronization, mounted Ops knowledge
   refresh, evidence publication, and an explicit decision to resume Feature
   024 T037.

## Complexity Tracking

No constitution violations require justification.
