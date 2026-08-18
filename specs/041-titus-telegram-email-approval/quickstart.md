# Qualification: Titus Telegram-Native Guarded Email Approval

Run from the repository root in the dedicated worktree.

1. Run the focused guarded-email and Telegram approval tests:

   ```bash
   python -m pytest \
     tenants/hermes-titus/mcp-servers/guarded-agentmail/tests \
     tenants/hermes-titus/tests/test_telegram_email_approval_contract.py \
     tenants/hermes-titus/tests/test_telegram_runtime_contract.py
   ```

2. Run syntax/config checks:

   ```bash
   bash -n tenants/hermes-titus/runtime/prepare-volume.sh
   bash -n tenants/hermes-titus/runtime/start-with-secrets.sh
   python -m compileall -q tenants/hermes-titus/plugins/approvals \
     tenants/hermes-titus/mcp-servers/guarded-agentmail
   ```

3. Inspect source and test output for tokens, credentials, provider content,
   and raw email bodies. Any hit is a failure.

4. If a private production qualification is separately authorized, verify one
   harmless prepared draft, native Telegram Approve Once, one exact verified
   receipt, Deny, expiry, unauthorized callback, and a repeated tool call. No
   production send or restart is authorized by this source task.
