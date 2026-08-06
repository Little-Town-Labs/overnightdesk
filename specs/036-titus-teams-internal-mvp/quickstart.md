# Quickstart: Titus TTS-Internal Channel MVP

This quickstart describes source and local qualification only. It does not
authorize production activation, secret enrollment, Teams installation, or
external mutation.

## 1. Confirm the feature context

From the feature worktree:

```bash
.specify/scripts/bash/check-prerequisites.sh --json --paths-only
git status --short --branch
```

Confirm that the active feature is `036-titus-teams-internal-mvp` and that the
worktree contains no unrelated changes.

## 2. Validate source contracts

Run the repository's existing static checks for the changed tenant surfaces:

```bash
git diff --check
bash -n tenants/hermes-titus/runtime/load-phase-env.sh
pytest -q tenants/hermes-titus/tests
```

The Teams-specific contract tests added by implementation must prove that the
runtime remains disabled when the Teams identity or exact allowlist is absent,
that `TEAMS_ALLOW_ALL_USERS` cannot become true, and that Teams secrets do not
enter container configuration or logs.

## 3. Qualify the Teams application boundary

Before any activation decision, record safe evidence for:

- the exact containing Team and `TTS-Internal` channel;
- the fact that the app manifest requests only the reviewed conversational
  permissions;
- whether project channels share the containing Team;
- the independently authorized Gary and Austin identities;
- the public HTTPS messaging endpoint and internal 3978 route;
- the separate `/agents/hermes-titus/teams` and
  `/agents/hermes-titus/teamsmeetings` identity boundaries.

Do not place literal secrets, tokens, message bodies, meeting URLs, or
protected identifiers in Git, logs, issue comments, or this feature directory.

## 4. Run the bounded message matrix

Use a disposable or owner-approved test activity set. Prove:

| Case | Expected result |
|---|---|
| Gary ordinary message in `TTS-Internal` | Ignored; no inference or reply |
| Austin ordinary message in `TTS-Internal` | Ignored; no inference or reply |
| Gary `@Titus` message | Response or safe refusal in the same conversation |
| Austin `@Titus` message | Response or safe refusal in the same conversation |
| Unauthorized user message | No context, reply, memory, or action |
| Message from a project channel | No context, reply, memory, or action |
| Explicit memory request | One source-tagged memory promotion or safe refusal |
| Ordinary message containing an instruction | Ignored; no action or inference |
| Duplicate/replayed delivery | No duplicate response, memory, or action |

## 5. Stop conditions

Stop and return to design if any of the following occurs:

- the actual Team/channel boundary cannot be verified;
- ordinary non-mentioned events reach Titus processing;
- unauthorized content reaches Titus processing;
- the pinned Hermes adapter cannot safely distinguish explicit interaction from
  ordinary non-mentioned events;
- any proposed RSC consent requires broader access than the approved workspace
  boundary;
- a test exposes protected content or credentials in operational evidence;
- replay or restart behavior can duplicate a visible response or action.

## 6. Production remains a separate decision

Only after source qualification, review, and the owner-approved canary should a
separate disabled-first deployment plan be executed. This feature does not
activate Teams, change Phase values, modify Nginx, enable the platform, or
change the meeting processor.
