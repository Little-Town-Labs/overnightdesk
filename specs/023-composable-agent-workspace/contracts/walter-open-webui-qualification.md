# Contract: Walter Open WebUI Qualification

## Authorization state

This contract plans a later controlled deployment slice. It does not authorize
production activation by itself.

## Required isolation

Walter Open WebUI must have distinct values for all of the following:

- deployment/container identity;
- persistent data volume;
- public hostname and Nginx route;
- Better Auth OIDC client and callback;
- canonical use-case/runtime resource bindings;
- Phase service account and allowed secret boundary;
- Open WebUI application secret/session state;
- provider configuration and rollback target.

No Titus credential, volume, OIDC client, cookie namespace, deployment ID, or
runtime binding may be reused.

## Provider policy

- Walter's primary Hermes provider remains Codex OAuth subscription access.
- OpenRouter may appear only as an explicitly named supplemental/fallback
  credential or as a separately qualified chat integration input.
- Interface availability cannot modify provider routing.
- Qualification evidence must prove the effective Walter Hermes primary model
  configuration before and after activation and rollback.

## Deployment gates

1. Read-only preflight proves current Walter, Titus, Nginx, OIDC, volume, and
   provider state.
2. Install Walter Open WebUI disabled and unreachable publicly.
3. Verify private health, exact bindings, service-account scope, data volume,
   value-free logs, and disabled-route behavior.
4. Rehearse rollback to the prior Walter dashboard-only state while preserving
   the candidate volume.
5. Enable only the Walter route and canonical OIDC/resource assignments.
6. Prove member allow, non-member denial, suspended denial/restoration, expired
   denial/restoration, chat response, sidebar persistence, restart persistence,
   explicit logout, OAuth expiry/renewal, revocation/reauthentication, and final
   owner acceptance.
7. Verify Titus and Walter native dashboard health after every mutation.
8. Record production results in `deploys.log` and update the platform standard
   only with verified facts.

## Rollback

Rollback disables the Walter public route and OIDC assignment, restores the
prior Nginx/config state, and leaves the Walter data volume recoverable. It must
not restart or reconfigure Titus and must not alter Walter's native dashboard or
Codex OAuth provider settings.

## Evidence restrictions

Evidence may include commit IDs, deployment/container names, timestamps,
status codes, gate names, and value-free result summaries. It must exclude
cookies, authorization codes, tokens, client secrets, Phase credentials,
provider keys, and conversation content.
