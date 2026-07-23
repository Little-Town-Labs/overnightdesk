# Data Model: Titus Advanced Dashboard Access

No schema migration is planned. The feature composes existing canonical and
dashboard lifecycle records.

## Canonical Dashboard Assignment

Represents one existing native dashboard attached to one exact runtime.

| Field                          | Rule                                                         |
| ------------------------------ | ------------------------------------------------------------ |
| `use_case_id`                  | Exact active Titus use case                                  |
| `runtime_identity_id`          | Exact active `hermes-titus` runtime identity                 |
| `tenant_id`                    | Fixed `titus-dashboard`; unique                              |
| `subdomain`                    | Fixed `titus-dashboard.overnightdesk.com`; unique HTTPS host |
| `container_id`                 | Existing `hermes-titus`; does not create a container         |
| `user_id`                      | Unique current canonical owner at reconciliation time        |
| `status`                       | `running` only after private runtime health is proven        |
| `engine_api_key`               | Null; dashboard projection is not an engine API identity     |
| `dashboard_token_hash`         | Null; native OIDC is the dashboard session boundary          |
| `phase_service_token`          | Null; existing Titus Phase boundaries remain unchanged       |
| `hermes_oidc_client_id`        | Null, then one exact public client ID                        |
| `hermes_dashboard_auth_status` | `legacy -> pending -> active`, or `disabled/error`           |

Validation requires exactly one matching canonical identity, one current owner,
one active platform-instance binding, no conflicting tenant/host/container row,
and no cross-runtime linkage.

## Resource Bindings

| Provider        | Kind                | Value                               | State                                                                                                                   |
| --------------- | ------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `docker`        | `container`         | `hermes-titus`                      | existing active                                                                                                         |
| `docker`        | `volume`            | `hermes-titus-data`                 | existing active                                                                                                         |
| `nginx`         | `hostname`          | `titus-dashboard.overnightdesk.com` | active canonical selector before assignment; public access still requires the independently disabled route and TLS gate |
| `overnightdesk` | `platform_instance` | `titus-dashboard`                   | active canonical selector                                                                                               |
| `better-auth`   | `oidc_client`       | opaque public client ID             | active only after runtime qualification                                                                                 |

Bindings are runtime scoped. A duplicate active value, a binding attached to a
different runtime, or a missing canonical selector blocks activation.

## Dashboard Authorization Context

| Field                 | Meaning                                                    |
| --------------------- | ---------------------------------------------------------- |
| `host`                | Normalized exact `X-Original-Host` requested through Nginx |
| `instance_id`         | Exact running dashboard projection                         |
| `instance_owner_id`   | Legacy fallback authority only                             |
| `use_case_id`         | Canonical membership scope when linked                     |
| `runtime_identity_id` | Exact runtime membership scope when linked                 |
| `client_id`           | Exact active OIDC audience                                 |
| `auth_status`         | Must be active for launch/token issuance                   |

State resolution:

1. No host, no exact row, duplicate row, stopped row, or partial canonical link
   resolves to denied.
2. Exact use-case/runtime link resolves through canonical membership.
3. No canonical fields resolves through exact legacy owner compatibility.
4. Any membership suspension, revocation, expiry, inactive use case, or inactive
   runtime resolves to denied.

## Public OIDC Client

The existing `oauth_client` contract remains unchanged:

- kind `hermes-dashboard`, schema version 1;
- metadata references exactly one dashboard projection;
- callback exactly
  `https://titus-dashboard.overnightdesk.com/auth/callback`;
- public client with no secret;
- authorization code and S256 PKCE;
- scopes exactly `openid profile email`;
- disabled until runtime configuration passes;
- no refresh-token/offline access.

## Runtime Configuration

Only the retained Titus configuration gains:

- public dashboard URL;
- self-hosted OIDC provider;
- canonical Better Auth issuer;
- public client ID;
- exact scope string.

No model, reasoning, delegation, memory, channel, skill, secret-path, Open WebUI,
or persona field changes.

## Lifecycle

```text
absent
  -> projection planned
  -> projection applied and verified
  -> OIDC pending, runtime-scoped client binding created, and route disabled
  -> runtime configured and privately healthy
  -> owner-directed protected qualification
  -> denial, lifecycle, persistence, and rollback gates passed
  -> owner accepted

active
  -> OIDC disabled
  -> route disabled
  -> loopback runtime restored
  -> data retained and capability unavailable
```

Every transition is idempotent, value-free in logs, and refuses ambiguity.
