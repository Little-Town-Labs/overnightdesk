# Data Model: Self-Service Setup Wizard

## Schema Changes

### 1. `instanceStatusEnum` — add `awaiting_provisioning`

```sql
ALTER TYPE instance_status ADD VALUE 'awaiting_provisioning' AFTER 'queued';
```

**Full lifecycle after change:**
```
queued → awaiting_provisioning → provisioning → running
                                              ↘ error
```

| Status | Meaning |
|---|---|
| `queued` | Payment received; wizard has not been completed |
| `awaiting_provisioning` | Wizard complete; secrets written; provisioner dispatched |
| `provisioning` | Provisioner is creating the container |
| `running` | Container live; customer can use agent |
| `error` | Provisioning failed |
| `stopped` | Container stopped (future) |
| `deprovisioned` | Subscription cancelled; data retained 30 days |

### 2. `instance.wizardState` — new JSONB column

```sql
ALTER TABLE instance ADD COLUMN wizard_state jsonb;
```

**Shape:**
```json
{
  "completedSteps": [1, 2],
  "currentStep": 3
}
```

- `completedSteps`: array of step numbers (1, 2, 3) that have been confirmed and written to Phase.dev
- `currentStep`: the step the user was on when they last interacted with the wizard
- `null` when wizard has not been started

**What is NOT stored in `wizardState`:**
- No secret values (OpenRouter key, Telegram token, etc.)
- No partial form input

## Fleet Events

| `eventType` | When | Details |
|---|---|---|
| `wizard.step.completed` | Each step written to Phase.dev | `{ step: 1, tenantId }` |
| `wizard.completed` | Wizard confirmed, provisioning triggered | `{ tenantId, stepsCompleted: [1,2,3] }` |
| `wizard.secrets_write_failed` | Phase.dev write failed | `{ step, error }` |
| `settings.credential_updated` | Credential updated via Settings | `{ field: "openrouter_key" | "telegram" }` |
