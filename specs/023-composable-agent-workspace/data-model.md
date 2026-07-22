# Data Model: Composable Agent Workspace

The initial frontend prototype is derived over existing canonical records. The
owner-approved persona presentation increment adds bounded optional logo data
to the existing canonical persona assignment; it does not add a second agent
identity source.

## PersonaPresentation

| Field | Meaning | Rule |
| --- | --- | --- |
| `displayName` | Mutable persona label | Existing canonical `persona_assignment.display_name`; 1-120 characters |
| `logoContentType` | Stored custom raster type | Nullable; exactly `image/png`, `image/jpeg`, or `image/webp` |
| `logoDataBase64` | Bounded raster bytes | Nullable; base64 only, decoded size at most 256 KiB; never logged or returned as JSON |
| `logoSha256` | Immutable presentation version | Nullable lowercase SHA-256; all three logo fields are null or all are present |
| `updatedAt` | Presentation change time | Updated with a successful name/logo mutation |

The browser receives a digest-addressed URL, never `logoDataBase64`. A public
image response is allowed because agent marks are presentation assets, not
credentials or tenant conversation data. A missing, malformed, ambiguous, or
inactive record falls back to the bundled persona mark in the authenticated
directory and returns no custom bytes from the image route.

### Persona presentation transitions

```text
bundled fallback -> owner uploads valid raster -> custom digest-addressed logo
custom logo      -> owner replaces valid raster -> new digest-addressed logo
custom logo      -> owner removes logo          -> bundled fallback
any state        -> invalid or unauthorized     -> unchanged
```

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

## CuratedOpenWebuiPersonaModel

| Field | Meaning | Qualification rule |
| --- | --- | --- |
| Model ID | Existing Hermes OpenAI-compatible ID | Remains unchanged; no provider reroute |
| Name | Canonical persona display name | Titus/Walter value supplied as deployment data |
| Avatar | Stable platform logo URL | HTTPS `www.overnightdesk.com` persona-image route only |
| Access | Read for authenticated deployment members | Public within the already membership-gated Open WebUI instance; no write grant |
| Arena | Evaluation comparison model | Disabled and empty |
| Product brand | Native Open WebUI identity | Preserved without replacement or co-branding |

## QualificationEvidence

Evidence is metadata-only: timestamp, task/gate, deployment or commit identity,
result, rollback identity, and value-free notes. It must never contain session
cookies, OAuth codes/tokens, service-account credentials, model-provider keys,
or chat content.
