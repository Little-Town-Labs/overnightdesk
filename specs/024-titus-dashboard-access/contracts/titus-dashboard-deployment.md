# Contract: Titus Native Dashboard Deployment

## Fixed identity

| Property | Value |
|---|---|
| Runtime | existing `hermes-titus` |
| Volume | existing `hermes-titus-data` |
| Public host | `titus-dashboard.overnightdesk.com` |
| Internal upstream | `hermes-titus:9119` |
| OIDC issuer | `https://www.overnightdesk.com/api/auth` |
| Callback | `https://titus-dashboard.overnightdesk.com/auth/callback` |
| Scopes | `openid profile email` |

The deployment does not change Titus Chat, model, provider, delegation,
reasoning, memory, channels, skills, Phase paths, service accounts, or persona.

## Runtime gate

- Dashboard binds to `0.0.0.0:9119` only after a valid self-hosted OIDC
  configuration is present.
- `--insecure` is prohibited.
- The container remains on the existing private network with zero published
  host ports.
- Startup without a configured native auth provider must fail closed.
- The dashboard config update is atomic and preserves unknown configuration.
- Restart targets only `hermes-titus` and must retain its named volume.

## Nginx gate

- Route installs disabled before DNS/TLS activation.
- Every dashboard, API, status, WebSocket, login, and callback path is covered
  by `auth_request`.
- Only the exact canonical platform verifier host is used with TLS SNI.
- Browser cookies and exact original host are forwarded to the verifier.
- Proxy forwards host/proto/forwarding headers required for the fixed callback.
- Anonymous or denied access exposes no upstream body.

## Qualification order

1. Static syntax, secret-literal, and configuration contract checks.
2. Read-only production preflight and retained-volume proof.
3. Canonical assignment `plan`; no write.
4. Canonical assignment apply and separate verification.
5. Disabled OIDC client and exact runtime-scoped client binding creation.
6. Runtime configuration, private auth/provider/status, and no-published-port checks.
7. Restart persistence and exact-runtime restart proof.
8. Temporary owner-directed DNS/TLS and protected route qualification.
9. Anonymous and current membership denial/restoration matrix.
10. Logout, expiry, revocation, reauthentication, and direct-route matrix.
11. Chat/history, Walter isolation, rollback rehearsal, and owner acceptance.

Temporary protected qualification is not normal production availability or
acceptance. The capability remains explicitly under qualification until all
later gates pass.

## Rollback order

1. Disable the Titus OIDC client.
2. Disable the Nginx route and retain TLS material.
3. Restore the prior loopback-only dashboard source.
4. Restart only `hermes-titus` and verify retained volume/data.
5. Disable or retire only the dashboard projection/bindings.
6. Verify Titus Chat, visible history, Walter Chat/dashboard, native runtimes,
   provider policy, public denial, private health, and restart counts.

Rollback never deletes a volume, OAuth audit history, canonical identity,
membership, Open WebUI deployment, secret boundary, or agent runtime.
