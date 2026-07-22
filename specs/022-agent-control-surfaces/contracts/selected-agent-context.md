# Contract: Selected Agent Context

## Resolver input

- Stable authenticated Better Auth `user.id` supplied server-side.
- Optional raw `agent` query value.
- Current time supplied for deterministic membership-expiry checks.

The resolver rejects array values, malformed slugs, explicit unknown keys,
inactive/expired membership, inactive use case/runtime, invalid persona data,
and directory ambiguity.

## Resolver output

```ts
type SelectedAgentResolution =
  | { status: "available"; agents: AgentDirectoryEntry[]; selected: SelectedAgentContext }
  | { status: "empty"; agents: [] }
  | { status: "unavailable" }
  | { status: "not_found" };
```

`SelectedAgentContext` contains only safe presentation and operational metadata.
It includes one exact optional instance association and a complete capability
list. It never contains secrets, service tokens, raw Phase coordinates, bearer
credentials, or a fallback instance.

## Consumer rules

1. Overview, Settings, and selected-agent Admin content call the same resolver.
2. A consumer may add page-specific content but may not recalculate identity,
   role, Runtime, or capability availability.
3. Global content renders outside the selected-agent context and is visibly
   labeled global.
4. All core selected-agent panels use the same order: selector, identity/use
   case, Runtime, capabilities, page-specific content.
5. Agent-specific branches by name, tenant string, or array index are forbidden.
