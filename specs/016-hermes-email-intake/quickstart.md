# Quickstart: Routed Hermes Email Intake

## Local qualification

```bash
cd tenants/hermes-titus/email-poller
scripts/qualify.sh
```

Qualification must run unit, race, vet, static build, shell syntax, source
hardening, credential-literal, and file-size checks.

## Contract verification

1. Insert a dirty AgentMail fixture and verify no Hermes request occurs.
2. Run the existing SecurityTeam staging poller and verify one clean row.
   Confirm the clean body preserves the authorized instruction while a
   mismatched-route fixture retains the untrusted-content wrapper.
3. Start the route-matching consumer and verify only `safe_content` is submitted.
4. Seed clean rows for the other two routes and verify they remain queued.
5. Replay the same provider message and verify one dirty row, run, and reply.
6. Force a Hermes approval-waiting run and verify email intake cannot approve it.
   Use the fixed helper only from the agent's Matrix or Telegram channel.
7. Restart after run submission and after reply submission; verify reconciliation
   prevents duplicate work.

## Production rollout

1. Keep all three instance configurations disabled.
2. Verify private Hermes API health and authenticated capabilities for each agent.
3. Install the shared image and three template instances.
4. Canary Titus dirty landing, then clean consumption and one harmless read.
5. Activate Hermes Agent for `netgleb@gmail.com`, then Hermes Mitchel for
   `mitchelcbrown88@gmail.com`; verify the exact Phase allowlist before each.
6. Inspect metadata-only logs and clean-table state; verify no cross-route claims.
7. Append the deployment record and synchronize the platform standard.

## Rollback

Disable and stop only the affected instance. Preserve its volume and database
rows. Do not delete or manually mark messages complete; reconcile or explicitly
requeue after the prior version or corrected build is restored.

## Production evidence - 2026-07-17

- Three complete Phase paths verified and enabled with exact sender policies.
- Dedicated `hermes_email_intake` database role verified without superuser or
  delete privilege.
- SecurityTeam image healthy; durable staging CLI and five-minute timer passed.
- Titus, Hermes Agent, and Hermes Mitchel authenticated Runs capabilities passed.
- All three intake containers healthy, hardened, private-only, and cycling.
- Legacy `titus-email-poller.service` is inactive and preserved for rollback.
- Historical checkpoints: Titus 4, Hermes Agent 0, Hermes Mitchel 0; zero sends.
- A fresh allowed-sender Titus email landed dirty, completed SecurityTeam with
  `auto_approved`, executed through Hermes, produced one in-thread AgentMail
  reply, reached `agent_zero_status=done` with no agent error, and the operator
  confirmed the response was visible in the originating mailbox.
- The smoke exposed Hermes' valid submission response `status: started`; a
  failing regression test reproduced it, the narrow validator fix was deployed,
  and the single harmless smoke row was reconciled once to completion.
