# Feature 3: Self-Service Setup Wizard

**Feature:** 3-self-service-setup-wizard
**Source:** PRD v3.0 Section 5, Phase 11
**Constitution:** v2.0.0
**Roadmap:** OvernightDesk v2
**Version:** 1.1.0
**Status:** Draft
**Date:** 2026-04-23

---

## Overview

### Customer Perspective

A customer who has just paid for OvernightDesk arrives at their dashboard to find their instance in `queued` status and a guided setup wizard waiting for them. The wizard walks them through the three things their agent needs to become useful: an OpenRouter API key (so the agent can call AI models), an optional Telegram connection (so they can message their agent from their phone), and optional personality settings (so the agent has the right name and timezone).

The wizard is designed for non-technical users. It does not require knowledge of Docker, environment files, or server configuration. Each step has plain-language instructions explaining what is being asked for and where to get it. The customer cannot accidentally break anything by entering the wrong value — the wizard validates their OpenRouter key in real time and shows an actionable error if it is wrong before they can proceed.

Only after the customer confirms their setup does the platform trigger provisioning of their hermes-agent container. This ordering is the critical contract: the wizard collects and stores all required secrets before a single container is started, so the agent has a complete configuration from its first boot.

Once the wizard completes, the customer watches their instance move from `queued` to `awaiting_provisioning` to `provisioning` to `running` in real time. When the instance is live, the dashboard unlocks and the customer can begin using their agent.

After initial setup, the customer can return to a Settings page at any time to update their credentials — for example, if they rotate their OpenRouter key or want to add a Telegram bot later. Updates take effect by applying the change to stored secrets and restarting the container. No server access is required.

### Platform Operator Perspective

This feature eliminates the need for Gary to manually inject credentials into a tenant's environment. Every secret the agent needs arrives from the customer, flows into the secrets store, and reaches the container at start time — without Gary's involvement and without the platform database ever holding the raw credential.

The wizard also removes the race condition in the previous provisioning design. Because the wizard must complete before provisioning fires, the provisioner always finds a fully populated secrets store. There are no silent failures from empty environment files.

---

## User Stories

### US-1 — New customer completes wizard for the first time

**As a new OvernightDesk customer, I want a guided setup wizard to appear immediately after payment so I can configure my agent with my own credentials without needing technical knowledge or server access.**

Acceptance criteria:
- When my instance is in `queued` status, the dashboard shows the setup wizard as the primary focus — not a loading spinner or an empty hub.
- The wizard presents my setup tasks in a clear sequence (API key, then optional messaging bridge, then optional personality), with a progress indicator showing where I am.
- Upon completing the wizard, I see confirmation that my setup is saved and my agent is being prepared, with no further action required from me.

---

### US-2 — Customer skips optional steps

**As a customer who does not use Telegram, I want to skip the Telegram and personality setup steps so I can get my agent running immediately with only the required OpenRouter key.**

Acceptance criteria:
- The wizard clearly labels which steps are optional and provides a visible "Skip" option for each optional step.
- Skipping both optional steps does not prevent the wizard from completing and provisioning from being triggered.
- The platform communicates to me that I can return to Settings at any time to add the skipped configuration later.

---

### US-3 — Customer is told their OpenRouter key is invalid

**As a customer who has entered an incorrect or expired OpenRouter API key, I want to see a clear, actionable error message so I know exactly what is wrong and how to fix it before proceeding.**

Acceptance criteria:
- If the key I enter fails validation, the wizard displays a human-readable error message that names the problem (for example: "This key is not valid. Please check it at openrouter.ai/keys and try again.").
- The wizard does not allow me to advance past the API key step while the key is invalid.
- The error is shown inline on the key entry step — I do not need to leave the wizard to see it.

---

### US-4 — Customer updates credentials from Settings after initial setup

**As an existing customer, I want to update my OpenRouter API key or add a Telegram bot token from the dashboard Settings page, so that I can rotate credentials or expand my agent's capabilities without contacting support.**

Acceptance criteria:
- The Settings page displays the current credential fields (OpenRouter key, Telegram bot token, Telegram user IDs) in a form I can edit.
- After saving a change, I receive confirmation that the update was applied and that my agent is restarting to pick up the new configuration.
- The updated credential replaces the previous one in the platform's secrets store — no old values are retained.

---

### US-5 — Customer sees real-time provisioning progress

**As a customer who has just completed the setup wizard, I want to watch my instance move through provisioning stages in real time so I know the system is working and approximately how long I need to wait.**

Acceptance criteria:
- After wizard completion, the dashboard displays a provisioning progress view showing the current stage (`queued`, `awaiting_provisioning`, `provisioning`, `running`) with a timestamp or elapsed time indicator.
- The status on screen advances when the underlying instance state changes — I do not need to manually refresh the page.
- When my instance reaches `running` status, the dashboard transitions to the agent hub view and makes the Launch button available without a full page reload.

---

### US-6 — Customer abandons wizard and returns later

**As a customer who started but did not finish the setup wizard in one sitting, I want the wizard to resume where I left off when I return to the dashboard, so I do not have to start over or worry that a half-finished setup caused a problem.**

Acceptance criteria:
- When I return to the dashboard after abandoning the wizard, the wizard is still shown and resumes at the first incomplete step.
- Completed steps display a masked placeholder (e.g. "sk-or-••••1234") confirming a value was saved, without revealing the actual value. Re-entry is required to change a completed step. Any partial input on the current incomplete step is cleared on return rather than pre-filled, to avoid stale or incorrect partial input being submitted.
- Provisioning is not triggered and no secrets are written until the wizard is explicitly completed — an abandoned wizard mid-way leaves the instance in `queued` status with no container started.

---

## Functional Requirements

### Wizard Ordering Gate

**FR-1** — The setup wizard must be shown as the primary dashboard view whenever an instance is in `queued` status and the wizard has not yet been completed by the customer. No other dashboard content (hub, chat, settings) is accessible until wizard completion.

**FR-2** — Provisioning must not be triggered by the Stripe payment webhook. The webhook creates the instance record with status `queued` and stops. Provisioning is triggered exclusively by successful wizard completion.

**FR-3** — The platform must track wizard completion state per instance so that returning customers are correctly routed to the wizard or the hub.

---

### Step 1 — OpenRouter API Key

**FR-4** — The wizard must collect the customer's OpenRouter API key on Step 1. This step is required — the wizard cannot be completed without it.

**FR-5** — The platform must validate the provided OpenRouter API key by making a test call to the OpenRouter service. Validation must occur server-side; the key must not be exposed to other client sessions or logged.

**FR-6** — If the OpenRouter key fails validation, the platform must return an actionable error message to the customer and prevent advancement past Step 1.

**FR-7** — If the OpenRouter key passes validation, the platform must write it to the tenant's secrets store path. The key must not be stored in the platform database in plaintext or any reversible encoding.

---

### Step 2 — Telegram Bridge (Optional)

**FR-8** — The wizard must offer Step 2 for Telegram bridge configuration. This step is optional and may be skipped.

**FR-9** — When the customer opts to configure Telegram, the wizard must collect a Telegram bot token and one or more Telegram user IDs that the bot is permitted to respond to.

**FR-10** — If the customer completes the Telegram step, the bot token and allowed user IDs must be written to the tenant's secrets store path before provisioning is triggered. The bot token must not be stored in the platform database in plaintext.

**FR-11** — If the customer skips Step 2, the wizard must advance to Step 3 without writing any Telegram-related secrets. The tenant's secrets store must contain no Telegram values unless the customer explicitly provides them.

---

### Step 3 — Agent Personality (Optional)

**FR-12** — The wizard must offer Step 3 for agent personality configuration. This step is optional and may be skipped.

**FR-13** — When the customer opts to configure personality, the wizard must collect an agent name and a timezone selection.

**FR-14** — If the customer completes the personality step, the agent name and timezone must be written to the tenant's secrets store path before provisioning is triggered.

**FR-15** — If the customer skips Step 3, the platform must apply documented default values for agent name and timezone. These defaults must be written to the tenant's secrets store path.

---

### Wizard Completion and Provisioning Trigger

**FR-16** — When the customer confirms the final step of the wizard, the platform must write all collected secrets to the tenant's secrets store path as an atomic operation before signalling provisioning.

**FR-17** — After secrets are confirmed written, the platform must advance the instance status from `queued` to `awaiting_provisioning`. The provisioner, upon detecting `awaiting_provisioning` status, dispatches the provisioning request and advances the instance status to `provisioning`.

**FR-18** — If the secrets write operation fails, provisioning must not be triggered. The instance must remain in `queued` status and the customer must be shown an error with instructions to retry.

**FR-19** — The wizard completion event must be logged as a fleet event.

---

### Real-Time Provisioning Progress

**FR-20** — After wizard completion, the dashboard must display the current instance status (`queued`, `awaiting_provisioning`, `provisioning`, `running`, `error`) to the customer.

**FR-21** — The dashboard must update the displayed status when the underlying instance state changes, without requiring a full page reload.

**FR-22** — When the instance reaches `running` status, the dashboard must transition to the agent hub view and make the Launch button available.

**FR-23** — If provisioning reaches `error` status, the dashboard must display a human-readable error state — not a permanent loading indicator. The error must instruct the customer on what to do (e.g. contact support).

---

### Settings — Credential Updates

**FR-24** — The dashboard Settings page must allow the customer to update their OpenRouter API key after initial setup.

**FR-25** — The dashboard Settings page must allow the customer to update or add a Telegram bot token and allowed user IDs after initial setup.

**FR-26** — When the customer saves an updated credential, the platform must write the new value to the tenant's secrets store path, replacing the previous value. The previous value must not be retained in the secrets store or the platform database.

**FR-27** — After a credential update is saved, the platform must restart the tenant's running container so the agent picks up the new configuration.

**FR-28** — The customer must receive clear confirmation after saving a credential update — both that the value was stored and that the container restart was initiated.

**FR-29** — When the customer saves an updated OpenRouter API key via Settings, the platform must validate the new key with a test call to OpenRouter before writing it to the secrets store — identical to the validation performed in the wizard. An invalid key blocks the save and displays an inline error; the existing key is retained. This prevents a bad key update from triggering a container restart that leaves the agent non-functional.

---

## Non-Functional Requirements

### Security

**NFR-1** — No tenant secret (OpenRouter API key, Telegram bot token, Telegram user IDs, agent name, timezone) may be stored in the platform database in plaintext or any reversible encoding at any point in the wizard or settings flow.

**NFR-2** — All secrets collected by the wizard must be transmitted to the platform server over an authenticated session — no credential may be sent or stored client-side.

**NFR-3** — OpenRouter key validation must be performed server-side only. The key must not appear in client-side state, browser storage, network responses to the browser, or platform logs.

**NFR-4** — The platform must not log the value of any secret at any log level. Only the event that a secret was written (or failed to be written) may be logged, without the value.

**NFR-5** — The tenant's secrets store path must not be readable by any other tenant. Secrets isolation is enforced at the secrets store level, not only at the application level.

---

### Usability

**NFR-6** — The wizard must be completable by a non-technical user with no knowledge of Docker, environment files, or server administration. Every step must include plain-language instructions explaining what is being asked and where to obtain the required value.

**NFR-7** — Each wizard step must provide a direct link to the external resource where the customer can obtain the required credential (e.g. openrouter.ai/keys, Telegram's @BotFather).

**NFR-8** — The wizard must function correctly on mobile screen sizes. A customer using a phone must be able to complete setup without horizontal scrolling or overlapping elements.

**NFR-9** — The total time for a non-technical user to complete the wizard (all steps, including reading instructions) must be achievable within five minutes under normal conditions.

**NFR-10** — Error messages displayed by the wizard must describe the problem in plain language and provide a next step. Raw error codes, stack traces, and internal system names must never appear in customer-facing messages.

---

### Reliability

**NFR-11** — The wizard must tolerate a temporary failure in the secrets store write (e.g. a transient network error) without leaving the instance in an unrecoverable state. The customer must be able to retry without data loss or duplicate provisioning.

**NFR-12** — If the customer's session expires mid-wizard, upon re-authentication they must be returned to the wizard at the correct step — not to an empty hub or a provisioning view.

---

## Edge Cases

**EC-1 — Invalid OpenRouter key:** The customer enters a syntactically plausible but invalid or expired key. The validation call to OpenRouter fails. The wizard must show an actionable inline error, remain on Step 1, and not write any value to the secrets store.

**EC-2 — Secrets store write failure:** The write to the tenant's secrets path fails after the customer completes the wizard (e.g. the secrets service is temporarily unavailable). The wizard must not trigger provisioning. The customer must see a clear error and a retry option. The instance remains `queued`.

**EC-3 — Provisioning failure after wizard completion:** The secrets write succeeds and provisioning is triggered, but the provisioning workflow fails (handled by Feature 2). The dashboard must show `error` status with a human-readable message. The customer must not see a permanent spinner. The wizard must not be re-shown — the error state is a provisioning failure, not a setup failure, and the customer should contact support rather than re-enter credentials.

**EC-4 — Customer abandons wizard mid-way:** The customer completes Step 1 but closes the browser before completing Step 2. On return, the wizard must resume at Step 2. Any secrets written for completed steps must remain in the secrets store from the prior session. Provisioning must not have been triggered.

**EC-5 — Customer re-opens wizard on second visit (already completed):** The customer has previously completed the wizard and their instance is `running`. Navigating to the dashboard must show the hub view, not the wizard. The wizard must not be re-shown once provisioning has been triggered. Credential changes after setup must go through Settings, not the wizard.

**EC-6 — Stripe webhook fires provisioning before wizard:** The instance status lifecycle introduces `awaiting_provisioning` as a distinct status to eliminate this race at the data model level. The full lifecycle is: `queued` (payment received, wizard pending) → `awaiting_provisioning` (wizard complete, all secrets written, ready to provision) → `provisioning` → `running`. The provisioner fires only when an instance is in `awaiting_provisioning` status. An instance in `queued` status is ignored by the provisioner. If a stale webhook handler or retry targets a `queued` instance, the provisioner refuses to proceed and logs a fleet event. No code path other than successful wizard completion may advance an instance from `queued` to `awaiting_provisioning`.

**EC-7 — Customer updates credentials while container is restarting:** The customer saves a Settings update while a previous restart is still in progress. The platform must either queue the second update until the first restart completes, or reject the second update with guidance to wait, rather than attempting concurrent restarts that could leave the container in an inconsistent state.

**EC-8 — Partial Telegram configuration (token without user IDs, or user IDs without token):** The customer enters a bot token but leaves the user ID field blank (or vice versa). The wizard must validate that both fields are present before writing Telegram secrets, and must show an inline error identifying the missing field.

---

## Out of Scope

The following are explicitly excluded from this feature specification:

- **Agent model selection:** Choosing which AI model the agent uses (e.g. selecting from OpenRouter model options) is not part of the wizard. The agent uses its default model configuration.

- **Agent system prompt / SOUL.md customisation:** Editing the agent's system prompt, persona document, or long-term memory files is not part of the wizard. Name and timezone are the only personality fields collected.

- **Discord bridge setup:** Configuring a Discord messaging bridge is not part of this wizard. Telegram is the only messaging bridge offered. Discord is a future bridge and will be added in a subsequent feature.

- **OpenRouter organisation or team key management:** The wizard collects a single OpenRouter API key. Managing multiple keys, teams, or spend limits within OpenRouter is the customer's responsibility via the OpenRouter dashboard.

- **Billing changes:** Plan upgrades, downgrades, and payment method changes are handled through Stripe Customer Portal and are not part of this wizard or Settings page.

- **Container image selection:** The hermes-agent container image is fixed by the platform. The customer cannot select or change the engine image.

- **SSH or direct container access:** The platform does not offer customers SSH access to their container. All configuration is through the wizard and Settings UI.

- **Data export:** Exporting agent data (conversation history, memory) is not part of this feature.

---

## Success Criteria

### For the Customer

- A non-technical user can complete the setup wizard from a fresh `queued` instance to a `running` agent without any external assistance, documentation, or server access.
- The wizard completes within five minutes for a user following the instructions at a normal reading pace.
- An invalid OpenRouter key produces an immediate, actionable error — the customer is never left wondering why nothing is happening.
- Skipping optional steps (Telegram, personality) produces a fully functional agent with default configuration.
- After wizard completion, the customer watches their instance reach `running` status on the same screen without reloading.
- A customer can update any credential from Settings and have the change reflected in their running agent within the container restart window.

### For the Platform (Gary)

- Zero manual credential injection is required for any new tenant from the moment this feature ships.
- The secrets store for every provisioned tenant is populated before the container ever starts — no agent launches with an empty environment.
- All secrets flow exclusively through the secrets store. No credential appears in the platform database, application logs, or error messages.
- The fleet event log shows a wizard-completion event for every tenant that triggers provisioning.
