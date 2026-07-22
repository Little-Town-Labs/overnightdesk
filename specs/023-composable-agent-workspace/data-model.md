# Data Model: Composable Agent Workspace

No database migration is planned for the frontend prototype. These models are
derived views over existing canonical records.

## SelectedAgentContext

| Field | Meaning | Rule |
| --- | --- | --- |
| `agent` | Membership-filtered directory entry | Exactly one explicit authorized key or the deterministic default |
| `instance` | Optional linked platform instance | Match by `runtimeIdentityId`; more than one fails closed |
| `agents` | All authorized active agents | Used by the shared selector; never filtered by persona name |
| `status` | Available, empty, unavailable, or not found | Invalid explicit selection never falls back |

## AgentCapability

| Field | Meaning | Rule |
| --- | --- | --- |
| `id` | `open_chat` or `advanced_dashboard` | Stable shared identifier |
| `state` | Available, not deployed, unavailable, or not applicable | Always explicit |
| `detail` | Value-free user explanation | No host, token, or internal error disclosure |
| `action` | Optional safe launch | Present only when state is available |
| `action.href` | Server-resolved URL | Internal selected-agent route or exact HTTPS OvernightDesk host |
| `action.external` | Independent browsing context | Required for the native dashboard |

## AgentWorkspaceComposition

| Field | Meaning | Rule |
| --- | --- | --- |
| `agent` | Selected identity and runtime metadata | Same entry used by Overview/Settings/Admin |
| `chat` | Open Chat capability plus optional canonical workspace | Workspace key must match the selected agent |
| `dashboard` | Native dashboard capability | Available launch must be external HTTPS |
| `fallbackMessage` | Established alternate channels | Presentation-only and value-free |

### Invariants

1. Exactly one chat and one dashboard capability descriptor is required.
2. An available chat capability requires a selected-agent workspace assignment.
3. An absent chat assignment cannot expose an embed URL.
4. An available dashboard requires an external HTTPS OvernightDesk URL.
5. Any contradiction produces an unavailable composition with no launch URLs.
6. The builder cannot inspect persona or tenant names.

## WalterChatDeployment

| Field | Meaning | Qualification rule |
| --- | --- | --- |
| Deployment ID | Walter Open WebUI runtime identity | Distinct from Titus |
| Persistent data | Walter chat history/configuration | Dedicated durable volume and restart proof |
| Hostname | Public Walter chat route | Exact HTTPS hostname and rollback mapping |
| OIDC client | Better Auth relying party | Walter use-case/runtime metadata only |
| Service account | Phase/bootstrap authority | Walter-scoped, least privilege, not shared |
| Runtime binding | Canonical Walter assignment | Exact use case and runtime identity |
| Provider policy | Chat integration and Hermes primary provider | Codex OAuth remains primary; supplemental OpenRouter named separately |
| Rollback target | Prior dashboard-only production state | Preserves data and Titus health |

## QualificationEvidence

Evidence is metadata-only: timestamp, task/gate, deployment or commit identity,
result, rollback identity, and value-free notes. It must never contain session
cookies, OAuth codes/tokens, service-account credentials, model-provider keys,
or chat content.
