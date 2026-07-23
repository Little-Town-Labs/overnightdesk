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

The owner supplies or approves the exact test recipient, subject, text, and
optional HTML in the authenticated Titus conversation.

1. Titus calls preparation.
2. Titus presents the complete returned draft and fingerprint.
3. The owner explicitly confirms that exact draft.
4. Titus calls the guarded send once with the exact fields/token.
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
