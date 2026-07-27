# Quickstart: Titus Codex OAuth Migration

This is an operator sequence, not a copy-paste credential procedure. Run the
repository-owned qualification and deploy commands; never print Phase or auth
documents.

## 1. Local qualification

```bash
python -m pytest \
  tenants/hermes-titus/mcp-servers/guarded-agentmail/tests/test_runtime_projection.py
npm test -- --runInBand src/lib/__tests__/managed-agent-variable.test.ts
bash -n tenants/hermes-titus/runtime/load-phase-env.sh
bash -n tenants/hermes-titus/runtime/start-with-secrets.sh
bash -n tenants/hermes-titus/scripts/deploy-aegis.sh
tenants/hermes-titus/scripts/qualify.sh
```

Expected: exact Sol/medium, Luna/high, OAuth-metadata, and MiMo-memory contracts
pass; no secret-like material appears in the diff.

## 2. Read-only production preflight

Record:

- Titus/Walter/Mitchel container identity and restart counts
- Titus service and email-intake state
- internal dashboard, API, and memory health
- current non-secret model/delegation/memory selectors
- Titus auth owner/mode and value-free provider status
- retained rollback image/source/config handles

Stop if Titus is already unhealthy or unrelated runtime state is ambiguous.

## 3. Copied-volume staging

Use the deploy script's staging path against a copy of `hermes-titus-data`.
Disable delivery and business mutations. Verify startup, config rendering,
memory initialization, OAuth-store preservation, and health without contacting
production channels.

## 4. OAuth enrollment

Run Hermes's no-browser `openai-codex` OAuth enrollment against Titus's own
persistent volume. The owner completes the presented OpenAI authorization
interaction. Do not paste authorization URLs, callbacks, codes, or tokens into
the repository, chat transcript, or deployment log.

Continue only when value-free status reports:

- active provider `openai-codex`
- auth mode `chatgpt`
- auth file owner `10000:10000`
- auth file mode `0600`

## 5. Controlled activation

Synchronize the exact reviewed source, update the compatible primary and memory
Phase selectors as one transaction, and restart only Titus. Run repository
verification immediately. Stop and roll back on the first unresolved failure.

## 6. Acceptance and observation

Require:

- exact Sol/medium primary projection
- exact bounded Luna/high delegation projection
- exact MiMo/Perplexity memory projection
- dashboard, API, and memory health
- no-tool primary canary
- bounded no-mutation delegation canary
- memory capture/recall canary with synthetic non-sensitive text
- unchanged Walter/Mitchel identity and restart counts
- zero relevant errors over the normal observation interval

Then append a value-free deployment record and reconcile the production
platform standard. Retain rollback handles until the observation window is
accepted; cleanup requires separate approval.
