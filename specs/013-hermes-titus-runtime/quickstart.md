# Quickstart: Hermes Titus Runtime

## Qualification

```bash
tenants/hermes-titus/scripts/qualify.sh
```

The check validates source contracts without reading Phase values.

## Deploy

```bash
tenants/hermes-titus/scripts/deploy-aegis.sh install
```

This prepares the named volume, stages pinned dependencies on ARM64, installs the systemd unit and root-owned Phase loader, and starts Titus on the OvernightDesk network.

## Verify

```bash
tenants/hermes-titus/scripts/deploy-aegis.sh verify
```

Expected evidence:

- systemd unit active
- `hermes-titus` running with zero published ports
- network membership is exactly the approved internal network
- core Hermes and TencentDB memory health pass
- Control Tower session returns the registered Titus binding
- Teams reports `pending` while Phase placeholders remain
- no secret values are printed

## Stop without deleting data

```bash
tenants/hermes-titus/scripts/deploy-aegis.sh stop
```

The `hermes-titus-data` volume remains intact.

## Activate TTS Teams later

1. Create the TTS bot with endpoint `https://<approved-domain>/api/messages`.
2. Replace the four required Phase placeholders: client ID, client secret, tenant ID, and allowed users.
3. Run a fresh preflight and add the approved TLS ingress.
4. Restart only Titus and verify local Teams health.
5. Install the app in TTS Teams and test with one authorized and one unauthorized identity.
