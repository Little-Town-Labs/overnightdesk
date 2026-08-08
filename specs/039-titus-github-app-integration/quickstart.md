# Quickstart: Titus GitHub App Integration

## Local checks

```bash
bash -n tenants/hermes-titus/runtime/load-phase-env.sh \
  tenants/hermes-titus/runtime/start-with-secrets.sh \
  tenants/hermes-titus/runtime/run-container.sh \
  tenants/hermes-titus/scripts/deploy-aegis.sh
uv run --with pytest --with pyyaml pytest -q \
  tenants/hermes-titus/mcp-servers/guarded-agentmail/tests/test_runtime_projection.py \
  tenants/hermes-titus/tests/test_github_runtime_contract.py
```

The tests use synthetic profiles. They must not access production Phase or
write to Aegis.

## Production handoff

After review and merge, use the existing Titus deployment procedure. The
controlled restart must be limited to `hermes-titus.service`. Then run:

```bash
tenants/hermes-titus/scripts/deploy-aegis.sh verify
```

Expected redacted evidence includes `github_state=ready`,
`github_provider=github-app`, the approved organization, and repository counts.
No token or private key may appear in output.
