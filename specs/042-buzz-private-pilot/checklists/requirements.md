# Specification Quality Checklist: Buzz Private Pilot on Aegis

**Created**: 2026-09-01

**Revalidated**: 2026-09-02

**Feature**: [spec.md](../spec.md)

## Content and Scope

- [x] MVP and explicit non-goals define the scope ceiling.
- [x] Planning reactivation is distinct from Issue or deployment reactivation.
- [x] Historical evidence and unexecuted tasks are clearly identified.
- [x] User scenarios are independently testable.
- [x] Twenty-seven requirements and fourteen success criteria are measurable.
- [x] No `[NEEDS CLARIFICATION]` marker or critical ambiguity remains.
- [x] Dependencies and time-sensitive assumptions are explicit Gate 0 facts.

## Security and Operations

- [x] Public IP/SNI/Host exposure is denied independently of DNS visibility.
- [x] Exact route advertisement/approval is separate from Buzz participant
  membership; the accepted tailnet-wide policy is explicit.
- [x] The incompatible Better Auth `auth_request` seam is explicitly excluded.
- [x] NIP-42 and NIP-98 require full signed-protocol contract tests.
- [x] Nginx, relay, stores, and the three Hermes intake workers have
  least-connectivity networks.
- [x] Intake workers never join the shared production network; Nginx brokers
  only fixed named Hermes operations.
- [x] Private host `:443` uses hardened systemd raw-TCP forwarding to fixed
  `buzz-ingress:8443`; intake uses only fixed `buzz-agents:443`; neither
  requires a Docker publication or Nginx recreation.
- [x] Each Hermes agent has a distinct read/write identity, owner-only trigger
  policy, exact signed-owner/channel checks, unchanged Hermes tool/approval authority,
  and revocation limited to unsubmitted/future-work rejection plus late-result
  suppression unless a cancellation API is later qualified.
- [x] Identity, secret, backup, restore, observability, capacity, and rollback
  boundaries are explicit.
- [x] Existing public Nginx and Tailscale Serve behavior must remain invariant.
- [x] Production, identity, route, secret, Issue, Project, and expansion actions
  require explicit approval.

## Notes

The owner clarified that agent participation is required for product value and
accepted current tailnet-wide reachability for the bounded pilot. The three
agents are the named Aegis Hermes runtimes; one is selected later as the
canary. The exact private listener address and operational values remain
evidence-based Gate 0 decisions.
