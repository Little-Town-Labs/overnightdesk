# Contract: Selected-Agent Workspace Composition

## Purpose

Define the pure server-to-presentation contract used by Overview and the
composable chat/dashboard workspace without adding an HTTP endpoint.

## Input

```ts
interface BuildAgentWorkspaceCompositionInput {
  agent: AgentDirectoryEntry;
  capabilities: readonly AgentCapability[];
}
```

The caller must already have resolved membership, explicit selection, exact
instance linkage, chat assignment, and native-dashboard OIDC state.

## Output

```ts
type AgentWorkspaceComposition =
  | {
      status: "available";
      agent: AgentDirectoryEntry;
      chat: AgentCapability & { id: "open_chat" };
      dashboard: AgentCapability & { id: "advanced_dashboard" };
    }
  | { status: "unavailable" };
```

## Validation and failure semantics

- Require exactly one supported descriptor for each stable capability ID.
- Reject unknown or duplicate capability IDs at the composition boundary.
- Available chat requires `agent.workspace` and the action must target
  `/dashboard/chat?agent=<encoded selected key>`.
- Available dashboard requires `external: true` and an HTTPS host ending in
  `.overnightdesk.com` with no credentials or non-default port.
- Non-available capabilities must not carry an action.
- Any contradiction returns `{status: "unavailable"}` with no URLs.
- The contract never logs or returns parsing details.

## Presentation semantics

- Chat may be embedded only from `agent.workspace.workspaceUrl`.
- Dashboard is a normal anchor with `target="_blank"` and
  `rel="noopener noreferrer"`.
- The selector contains every authorized agent and uses the stable selected key.
- Dashboard-only, chat-only, and neither states retain the shared identity and
  capability presentation.
- No implementation branches on agent key, persona name, or tenant ID.

## Compatibility

- Existing `/dashboard/chat?agent=` links remain valid.
- Existing `AgentCapability` descriptors remain the one source for labels,
  state, detail, and launches.
- This additive contract does not change the Open WebUI OIDC or native Hermes
  dashboard authentication contracts.
