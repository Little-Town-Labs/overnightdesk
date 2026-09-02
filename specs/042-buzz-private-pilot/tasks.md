# Tasks: Buzz Private Pilot on Aegis

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`

**Status**: Gate 0 read-only evidence collection in progress; no production
mutation authorized

**Method**: Contracts first. Production tasks are sequential, owned by Sol, and marked **[OWNER APPROVAL]**.

## Historical record — completed 2026-09-01

These tasks produced research and local evidence only. Their sidecar topology
is superseded but the record is retained.

- [X] T001 Create and route Issue #249 with its original acceptance criteria.
- [X] T002 Record the historical decision in docs/decisions/007-buzz-private-pilot.md.
- [X] T003 Document the original lifecycle in docs/runbooks/buzz-private-pilot.md.
- [X] T004 Assess the pinned Buzz source/image and record specs/042-buzz-private-pilot/evidence/candidate.md.
- [X] T005 Capture the 2026-09-01 read-only Aegis baseline in specs/042-buzz-private-pilot/evidence/baseline.md.
- [X] T006 Freeze the original sidecar topology and authority model.
- [X] T007 Research official Tailscale container and Serve interfaces.
- [X] T008 Run the local relay-wrapper and sidecar experiments recorded in specs/042-buzz-private-pilot/evidence/gate-0-remediation.md.
- [X] T009 Add the historical candidate-image contract and exact-artifact relay wrapper under infra/buzz/.

T010-T054 were never executed. They are retired rather than renumbered or
silently rewritten. Continuation begins at T055.

## Phase 1 — Reactivation and current-fact freeze

- [X] T055 **[OWNER APPROVAL]** Update the reopened Issue #249 body to the ADR-008 scope, confirm its Engineering Delivery project 4 routing, and initialize current delivery fields without implying deployment approval (FR-027) in the approved GitHub surfaces.
- [X] T056 Refresh Buzz repository, security policy, client/relay URL behavior, NIP-AA behavior, issue #6281, release/commit status, and supported ARM64 artifacts in specs/042-buzz-private-pilot/evidence/current-upstream.md (FR-001, FR-002).
- [ ] T057 Requalify relay, PostgreSQL, Redis, MinIO, initializer, and Hermes intake-worker images by immutable ARM64 digest, provenance, SBOM, vulnerability disposition, non-root execution, and startup behavior in specs/042-buzz-private-pilot/evidence/current-images.md (FR-001, FR-026).
- [X] T058 [P] Perform read-only Aegis inventory of addresses, interfaces, Docker port bindings/networks, Nginx image/modules/listeners/config/reload method, service health, capacity, disk, and backup state in specs/042-buzz-private-pilot/evidence/current-aegis.md (FR-003, FR-004, FR-008, FR-025).
- [X] T059 [P] Perform read-only OCI inspection of VNIC private/public addresses, NAT, route tables, gateways, security lists, IPv6, and DNS/certificate constraints in specs/042-buzz-private-pilot/evidence/current-oci.md (FR-004, FR-009, FR-011).
- [X] T060 [P] Perform read-only Tailscale inspection of node identity, version, advertised/approved routes, route injection, grants, Serve root, and `ob1-mcp` handler in specs/042-buzz-private-pilot/evidence/current-tailscale.md (FR-005 through FR-007).
- [X] T061 Select and record a candidate private listener address only if T058-T060 prove it unassigned, valid for the intended OCI VNIC and host interface, exactly routable, publicly unreachable, and safely removable in docs/runbooks/buzz-private-pilot.md (FR-004, FR-005, FR-009).
- [ ] T062 Freeze the exact OCI VNIC/host-interface assignment and removal procedure, fixed `buzz-ingress:8443` and `buzz-agents:443` Nginx addresses, hardened systemd socket/proxy units, WebSocket relay URL, literal supported NIP-98 method/full-HTTPS-URL pairs, DNS-01 certificate/renewal, private resolution, exact `/32`, unchanged tailnet-policy digest, fixed-target Nginx-to-Hermes egress routes and anchored run-ID/no-query/no-approval rules, resource ceilings, recovery targets, approval owners, and rollback assertions in docs/runbooks/buzz-private-pilot.md (FR-004 through FR-006, FR-010, FR-011, FR-017, FR-019 through FR-022).

**Checkpoint**: Current facts and inputs are immutable; no production state changed.

## Phase 2 — Failing local contracts

- [ ] T063 Create minimal renderable service, Nginx, and systemd socket/proxy fixtures with immutable placeholders in infra/buzz/compose.yml, infra/buzz/compose.aegis.yml, infra/buzz/nginx/buzz-private.conf.example, and infra/buzz/systemd/ so tests have concrete targets (FR-003, FR-004, FR-015, FR-022).
- [ ] T064 [P] Write failing image, hardening, resource, optional-surface, and no-public-port contracts in infra/buzz/tests/test_compose_contract.py (FR-001, FR-003, FR-025, FR-026).
- [ ] T065 [P] Write failing exact dual-private-endpoint Nginx listener, hardened raw-TCP systemd socket/proxy, no-new-Docker-publication/container-recreation, shared/public-wildcard non-selection, DNS/certificate, no-`auth_request`, raw header/URI preservation, distinct no-`:443` WebSocket/HTTPS canonical forms, and Nginx reload contracts in infra/buzz/tests/test_ingress_contract.py (FR-004, FR-008 through FR-013, FR-022).
- [ ] T066 [P] Write failing full signed NIP-42 fixtures for the exact WebSocket relay URL and NIP-98 fixtures for every frozen exact method/full-HTTPS-URL pair under infra/buzz/tests/protocol/, with assertions in infra/buzz/tests/test_protocol_contract.py (FR-010, FR-012, FR-014).
- [ ] T067 [P] Write failing internal three-network membership, canonical Nginx alias, no default agent egress, intake absence from the shared production network, fixed-target Nginx Hermes egress allowlist, anchored run-ID validation, no-query/no-approval-path behavior, and forbidden-path tests for `buzz-ingress`, `buzz-data`, and `buzz-agents` in infra/buzz/tests/test_network_contract.py (FR-015, FR-020).
- [ ] T068 [P] Write failing secondary-address assignment/removal, exact `/32`, systemd socket-first rollback, unchanged-policy digest, Docker-publication/Nginx-container/address/route/Serve invariance, and rollback-ordering tests in infra/buzz/tests/test_route_contract.py (FR-004 through FR-007, FR-021 through FR-023).
- [ ] T069 [P] Write failing secret projection, owner-key exclusion, safe-log, and evidence-sentinel tests in infra/buzz/tests/test_secret_and_log_contract.py (FR-018, FR-024, FR-026).
- [ ] T070 [P] Write failing coherent PostgreSQL+MinIO set, completeness, disposable restore, and logical-assertion tests in infra/buzz/tests/test_backup_restore_contract.py (FR-016, FR-017).
- [ ] T071 [P] Write failing per-agent identity, read/write membership, signed-owner/channel trigger, same-channel reply, bot-trigger denial, exact fail-closed brokered Hermes mapping, shared-network/unrelated-service/cross-runtime denial, existing-tool/approval-policy preservation, approval-bypass denial, network/concurrency/output/timeout/deduplication-only state, unsubmitted/future-work rejection, and late-result suppression tests in infra/buzz/tests/test_agent_authority_contract.py (FR-019, FR-020).
- [ ] T072 Write deterministic commands in infra/buzz/tests/README.md and prove T064-T071 fail only for their intended missing behavior (FR-026).

**Checkpoint**: Every security, protocol, recovery, authority, and lifecycle boundary has an intentional failing contract.

## Phase 3 — Minimum local implementation

- [ ] T073 [US2] Implement immutable, non-root, hardened relay/store services, volumes, health checks, and limits in infra/buzz/compose.yml and infra/buzz/compose.aegis.yml until T064 passes (FR-001, FR-003, FR-016, FR-025).
- [ ] T074 [US2] Implement internal `buzz-ingress`, `buzz-data`, and `buzz-agents` membership, the canonical Nginx alias, no default agent egress, and intake-worker exclusion from the shared production network in infra/buzz/compose.yml and infra/buzz/compose.aegis.yml until T067 passes (FR-015, FR-020).
- [ ] T075 [US1] Implement the exact dual-private-endpoint canonical Buzz server block and fixed-target named Hermes egress broker in infra/buzz/nginx/buzz-private.conf.example until T065 and T067 pass (FR-004, FR-008 through FR-013, FR-020, FR-022).
- [ ] T076 [US1] Implement the synthetic canonical NIP-42/NIP-98 Nginx harness under infra/buzz/tests/protocol/ until T066 passes (FR-010, FR-012, FR-014).
- [ ] T077 [P] [US2] Implement runtime secret projection and non-secret configuration examples in infra/buzz/load-phase-env.sh and infra/buzz/env.example until T069 passes (FR-018, FR-024).
- [ ] T078 [P] [US2] Implement coherent encrypted backup and disposable restore helpers in infra/buzz/backup-buzz.sh and infra/buzz/restore-rehearsal.sh until T070 passes (FR-016, FR-017).
- [ ] T079 [P] [US3] Implement one route-configured Buzz intake worker with distinct Walter, Titus, and Mitchel/Trevor profiles, exact signed-owner/channel checks, same-channel bounded replies, fail-closed brokered Hermes Runs API mapping, deduplication-only state, canonical-Nginx Buzz transport, non-bypassable existing approval policy, unsubmitted/future-work rejection, and late-result suppression in infra/buzz/agents/ and infra/buzz/compose.aegis.yml until T071 passes (FR-019, FR-020).
- [ ] T080 [US2] Implement disabled install, both fixed Nginx bridge attachments/listeners, hardened infra/buzz/systemd/ socket/proxy units, approval-bound secondary-address assignment/removal, validate/reload without Nginx recreation, exact-route activation without policy mutation, socket-first rollback, status, approval guards, and invariant comparisons in infra/buzz/deploy-aegis.sh and infra/buzz/rollback.sh until T068 passes (FR-004 through FR-007, FR-021 through FR-023).
- [ ] T081 [US2] Run all local contracts, rendered-Compose checks, synthetic protocol matrix, safe-log sentinel, recovery rehearsal, and rollback simulation; record digest-bound results in specs/042-buzz-private-pilot/evidence/local-qualification.md (SC-001, SC-005, SC-012).

**Checkpoint**: The proposed topology is locally executable and still has no production effect.

## Phase 4 — Route coexistence proof

- [ ] T082 [US2] **[OWNER APPROVAL]** Capture signed current production baselines and install the inactive private Nginx include plus protocol probe without admitting any Buzz identity (FR-021, FR-026) on Aegis.
- [ ] T083 [US2] **[OWNER APPROVAL]** Assign the selected secondary private IP to the frozen OCI VNIC and host interface, prove the exact local address/socket bind and public denial, advertise/approve only its `/32` without changing tailnet policy, validate/reload the fixed-bridge Nginx listener without recreating its container, start only the Buzz systemd socket proxy, and record exact mutations in specs/042-buzz-private-pilot/evidence/route-experiment.md (FR-004 through FR-006, FR-009, FR-022).
- [ ] T084 [US1] **[OWNER APPROVAL]** Execute NIP-42 against the exact WebSocket relay URL, every frozen NIP-98 method/full-HTTPS-URL pair, and public IPv4/IPv6, forged-SNI/Host, unadmitted-identity, alternate-hostname, and direct-target denial tests in specs/042-buzz-private-pilot/evidence/route-experiment.md (FR-009, FR-010, FR-012, FR-014).
- [ ] T085 [US2] **[OWNER APPROVAL]** Stop the private systemd socket first, prove Buzz unreachable, remove the Nginx include with a validated reload, withdraw only the exact `/32`, remove only the Buzz host-interface and OCI VNIC secondary-address assignment, and prove Docker publications, Nginx container identity, addresses, routes, policy digest, Serve, public vhosts, services, and health match baseline in specs/042-buzz-private-pilot/evidence/route-experiment.md (FR-004, FR-007, FR-008, FR-023).

**Checkpoint**: Private route and protocol coexistence are proven and fully rolled back.

## Phase 5 — Disabled installation and owner qualification

- [ ] T086 [US2] **[OWNER APPROVAL]** Install exact root-owned sources and immutable services disabled on Aegis with no route and no admitted identity; record specs/042-buzz-private-pilot/evidence/private-qualification.md (FR-001, FR-003, FR-015, FR-021).
- [ ] T087 [US2] **[OWNER APPROVAL]** Verify hardening, network isolation, readiness, restart, resource ceiling, safe logs, and existing-service health in specs/042-buzz-private-pilot/evidence/private-qualification.md (FR-015, FR-024, FR-025).
- [ ] T088 [US2] **[OWNER APPROVAL]** Create the coherent encrypted set, verify off-box completion, restore it unrouted, run logical assertions, and record RPO/RTO in specs/042-buzz-private-pilot/evidence/restore-rehearsal.md (FR-016, FR-017, SC-006).
- [ ] T089 [US2] **[OWNER APPROVAL]** Rehearse socket-first rollback, including systemd listener stop, validated Nginx include removal, exact route withdrawal, and secondary-address removal, and confirm Buzz unreachability plus existing-state invariance in specs/042-buzz-private-pilot/evidence/rollback-rehearsal.md (FR-004, FR-021 through FR-023, SC-007).
- [ ] T090 [US1] **[OWNER APPROVAL]** After T089 has removed the rehearsal address, reassign the selected secondary private IP to the frozen OCI VNIC and host interface, repeat exact local-address/socket-bind and public-denial proof, activate only its `/32`, internal Nginx listener, and systemd socket without changing tailnet policy or recreating Nginx, and admit only the client-held owner identity (FR-004 through FR-006, FR-009, FR-018, FR-021, FR-022).
- [ ] T091 [US1] **[OWNER APPROVAL]** Run owner collaboration, complete NIP-42/NIP-98, public and unadmitted-identity denial, reconnect, restart, load, resource, and sentinel checks in specs/042-buzz-private-pilot/evidence/owner-qualification.md (SC-002, SC-003, SC-004, SC-008, SC-011, SC-012).

**Checkpoint**: Owner-only use passes; all Hermes intake workers remain disabled.

## Phase 6 — Named Hermes agents and observation

- [ ] T092 [US3] **[OWNER APPROVAL]** Select one of Walter, Titus, or Mitchel/Trevor as the canary; create its distinct read/write Buzz key/scope; admit it to the owner and one pilot channel; and start its signed-owner-triggered canonical-Nginx intake route to the exact Hermes Runs API (FR-019, FR-020).
- [ ] T093 [US3] **[OWNER APPROVAL]** Execute twenty valid, caller/channel/bot-trigger denial, signature, exact broker route, existing-tool/approval-policy, shared-network/direct-relay/store/unrelated-service denial, duplicate, adversarial, restart, resource, unsubmitted/future-work rejection, and late-result suppression cases for the canary in specs/042-buzz-private-pilot/evidence/canary-qualification.md (SC-005, SC-009 through SC-012).
- [ ] T094 [US3] **[OWNER APPROVAL]** Create distinct keys/scopes for the remaining two named Hermes agents, admit and qualify them one at a time with the complete T093 matrix, and record per-agent isolation and revocation evidence in specs/042-buzz-private-pilot/evidence/hermes-agent-qualification.md (FR-019, FR-020, SC-005, SC-009 through SC-012).
- [ ] T095 [US4] **[OWNER APPROVAL]** Run the seven-day bounded observation with only the owner, three named agents, and one pilot channel; record daily safe evidence in specs/042-buzz-private-pilot/evidence/observation.md (FR-024, FR-027, SC-013, SC-014).
- [ ] T096 [US4] Record exactly one continue/pause/rollback/new-scope decision and synchronized operational documentation in specs/042-buzz-private-pilot/evidence/pilot-decision.md and docs/runbooks/buzz-private-pilot.md (FR-027, SC-014).

## Phase 7 — Final quality gate

- [ ] T097 Run all tests, rendering, protocol, public-denial, route/Serve invariance, security/sentinel, recovery, documentation-link, and task-coverage checks on the latest reviewed head (FR-026).
- [ ] T098 Perform security-and-hardening review of authentication, route/listener, network, identity, secret, recovery, telemetry, and rollback contracts; disposition findings without expanding scope in specs/042-buzz-private-pilot/evidence/final-review.md (FR-026).
- [ ] T099 Perform code-review-and-quality against Issue/spec, latest-head CI, approvals, follow-ups, rollout, and rollback; confirm merge and production activation remain separate decisions in specs/042-buzz-private-pilot/evidence/final-review.md (FR-027).

## Dependencies

- T056-T060 may run concurrently; T061-T062 require their evidence.
- T063 enables T064-T071; all failing contracts precede T073-T080.
- T081 requires T073-T080 and gates every production task.
- T082-T085 are sequential and require separate production authorization.
- T085 must prove full rollback before T086.
- T086-T089 precede T090; T090 must repeat the address assignment and bind proof
  because T089 returns the rehearsal to an unassigned baseline; T091 precedes
  T092.
- T092 precedes T093; T093 gates the one-at-a-time T094 admissions; T094
  precedes T095; T095 precedes T096.
- T097-T099 run on the final selected head and do not authorize deployment.
- T055 is required for tracked delivery but does not block read-only/local Gate
  0 research unless repository governance requires an active Issue first.

## MVP Stop Points

- T085: ingress feasibility proven, production returned to baseline.
- T089: disabled workload is recoverable and reversible, no user admitted.
- T091: owner-only product value proven.
- T093: one named Hermes canary authority proven.
- T094: all three named Hermes identities qualified independently.

Every stop point permits pause or socket-first rollback without expanding
scope.
