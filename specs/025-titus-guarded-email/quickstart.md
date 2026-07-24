# Quickstart: Titus Guarded Outbound Email Qualification

All output must remain value-free. Never put a real recipient, subject, body,
approval token, API key, SecurityTeam token, or raw provider response in test
logs or feature evidence.

## 1. Containment

1. Run the focused configuration contract and observe RED because the current
   hosted AgentMail server exposes mutations.
2. Add the exact eight-tool read-only include list.
3. Update the Titus email skill to state that direct mutations are unavailable.
4. Run focused and full Titus qualification.
5. Review, merge, stage exact `main`, restart only Titus, and enumerate the
   effective tool names.
6. Confirm all eight currently available reads are present and every known
   mutation is absent.
7. Append the production result to `deploys.log`.

Rollback for this phase preserves the read-only allowlist; there is no safe
reason to restore direct provider mutations.

## 2. Guarded core RED/GREEN

The failing tests must cover:

- empty and whitespace-only subject;
- neither text nor HTML;
- invalid, duplicate, or oversized recipient input;
- wrong Titus inbox;
- unsupported envelope fields;
- malformed, expired, mismatched, and incorrectly signed approval tokens;
- SecurityTeam 401, denial, timeout, 5xx, malformed response, and changed
  returned content;
- AgentMail timeout, invalid JSON, missing IDs, and provider errors;
- readback inbox/message/thread/recipient/subject/text/HTML/sent-label
  mismatches;
- exact success;
- repeated verified request;
- ambiguous retry inside the provider window;
- ambiguous retry after the provider window.

Observe RED before implementing each behavior, then GREEN and the full
regression suite.

## 3. Private production qualification

Before mutation:

1. Record Titus/Walter/Mitchel/Open WebUI/Nginx/Ops container identities,
   start times, restart counts, volumes, and health.
2. Confirm Feature 024 authority, route, and dashboard remain healthy.
3. Confirm SecurityTeam health from Titus and its authenticated outbound check
   with content-free fixtures.
4. Confirm the exact AgentMail inbox without sending.

Activate the guarded candidate:

1. Bind the existing SecurityTeam caller value into the exact protected Titus
   Phase runtime path without printing it.
2. Stage merged source and restart only `hermes-titus.service`.
3. Enumerate hosted and local MCP tools.
4. Run content-free preparation and every pre-send failure case.
5. Prove zero AgentMail sent-message count increase during the failure matrix.
6. Restart Titus again and repeat tool/state checks.

## 4. Owner-approved harmless send

The owner asks Titus to send the message in ordinary language. Titus uses
trusted conversation and memory context to compose the exact recipient,
subject, text, and optional HTML, asking only for genuinely missing or
materially ambiguous information.

1. Titus calls preparation internally.
2. Titus presents the complete readable returned draft and asks, "Approve and
   send this email?" Tool names, approval tokens, fingerprints, and technical
   next actions remain internal.
3. The owner explicitly confirms that exact draft in ordinary language.
4. Titus calls the guarded send once internally with the exact fields/token.
5. The guarded result must be `verified_sent`.
6. Independently retrieve the provider record and compare the exact fields
   without copying content into logs.
7. Invoke the same logical send again and prove the same provider identifiers
   return with no sent-message count increase.

## 5. Observation and rollback

Observe SecurityTeam, Titus, Nginx, Ops, and provider sent metadata for at least
one normal health interval with zero relevant error signatures.

Rollback rehearsal:

1. Disable only the local guarded MCP server.
2. Restart only Titus.
3. Prove hosted email remains exactly read-only.
4. Prove the attempt ledger and all runtime/chat/memory/dashboard/inbound-email
   volumes remain.
5. Restore the guarded candidate from merged source and requalify, or leave
   read-only only by explicit owner decision.

## 6. Closeout

1. Update Feature 025 tasks and evidence.
2. Update `overnightdesk-platform-standard`, including current WHY/WHO-backed
   runtime facts.
3. Refresh the production-mounted standard using the established
   `/app/standard/{WHY,HOW,WHAT}` layout and `KNOWLEDGE_DIR=/app/standard/WHAT`.
4. Restart only `overnightdesk-ops` if its mounted knowledge changed and prove
   its health.
5. Append all production results to `deploys.log`.
6. Publish, merge, deploy, and decide whether Feature 024 T037 may resume.

## 7. Production closeout evidence — 2026-07-24

- T041-T047 are supported by the merged guarded-sender, containment,
  activation, private-failure, persistence, natural-language approval, and
  owner-send increments recorded in `deploys.log`.
- T048 combines independent provider-record reconciliation with the automated
  one-send proof. Removing only AgentMail's exact deterministic footer
  reproduced both immutable pre-send draft digests, while 17 focused
  readback/idempotency/retry tests proved exact success reuses one provider
  message identity and does not send twice. No additional live retry or
  qualification email was required.
- T049 completed after the guarded restoration: one normal Titus health
  interval ended with Titus and SecurityTeam healthy, Nginx and Ops running,
  and zero relevant error signatures across all four.
- T050 installed only the root-owned mode-0400 read-only marker and restarted
  only Titus. The live registry exposed exactly eight hosted reads and no
  guarded mutation tools. The attempt-ledger inode, size, mode, and two
  content-free rows; runtime, chat, memory, dashboard, and intake volumes;
  dashboard route and certificate; intake topology; and every unrelated
  container identity remained unchanged.
- T051 removed only that marker and restarted only Titus. Full qualification
  restored exactly two local guarded tools alongside the eight hosted reads.
  Public `www` returned HTTP 200; anonymous Titus dashboard, Titus Chat, and
  Walter Chat returned HTTP 401.
- T052 is satisfied by the value-free deployment ledger through the T050
  rollback and T049/T051 restoration entries. No email, retry, provider
  mutation, secret, route, authority, membership, chat, memory, volume, or
  unrelated-service change occurred during lifecycle qualification.
- Standard PR 41 merged at `26201b9` and its exact Aegis synchronization
  loaded all 16 `WHAT/*.yaml` files, including `why.yaml` and `who.yaml`, after
  an Ops-only restart. The lifecycle rehearsal ended in the already-documented
  guarded state, so no repeat standard deployment or runtime-fact change is
  required.

Standard PR 42 merged the already-completed synchronization bookkeeping at
`6137c23` without changing any live contract. OvernightDesk PR 123 merged at
`d949d9d`; its exact Vercel production deployment
`dpl_7km2YsqJ4fJTpLjoGX8mRCkcaqVM` reached Ready on every live alias.

Final T058 read-only qualification returned the rollback marker absent,
`guarded_email_mode=guarded`, the exact eight hosted AgentMail reads, the exact
two local guarded tools, MiMo with medium reasoning and the approved delegation
route, healthy Titus and SecurityTeam, running Nginx and Ops, restart count zero
and zero recent critical signatures across all four services. Public `www`
returned HTTP 200; the canonical Titus dashboard, Titus Chat, and Walter Chat
hosts returned anonymous HTTP 401. No email, retry, restart, provider mutation,
model change, secret, route, authority, membership, chat, memory, volume, or
unrelated-service change occurred.

Feature 025 is complete at 78/78. Guarded sending remains active, and Feature
024 T037 is authorized to resume.
