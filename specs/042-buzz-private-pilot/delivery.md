# Delivery Profile: 042-buzz-private-pilot

## Classification

- Project: `overnightdesk`
- Context: `brownfield`
- Scale: `system`
- Risk: `production`
- Mode: `planning-reactivated`
- Spec Kit required: `yes`
- Mutation owner: `sol-lead`
- Primary Issue: [#249](https://github.com/Little-Town-Labs/overnightdesk/issues/249), reopened for planning on 2026-09-02
- Delivery Project: [Engineering Delivery project 4](https://github.com/users/poorlyordered/projects/4)

## Current Gate

Gate 0 documentation is active. Issue reopening is complete. No implementation,
registry, Phase, Aegis, tailnet, route, DNS, certificate, identity, admission,
deployment, remote Git, Issue-content, or Project mutation is authorized.

T001-T009 remain completed historical research. T010-T054 are retired and were
never executed. Continuation tasks begin at T055 to preserve the audit trail.

## Codebase Graph and Targeted Verification

- Policy: required before brownfield planning
- Project: `overnightdesk`
- Status: ready (13,789 nodes / 26,616 edges at planning time)

Graph discovery and source reads confirmed the existing Better Auth
`verify-tenant` and Open WebUI `verify-workspace` contracts are incompatible
with Buzz Desktop's NIP-42/NIP-98 client. The revised plan uses Tailscale route
and grant controls for transport and Buzz membership for application access.

## Cross-Artifact Analysis

The 2026-09-02 Spec Kit consistency pass found no unresolved critical
ambiguity, constitutional conflict, placeholder, stale active-sidecar
assumption, or uncovered requirement. The active set contains 27 functional
requirements, 14 success criteria, nine preserved historical tasks, and 44
contiguous continuation tasks T055-T098. Every requirement and success
criterion has task coverage; local document links resolve.

One format finding was remediated during the quality pass: explicit acceptance
scenarios, edge cases, key entities, project structure, and user-story task
tags were restored to match the repository templates.

## Delivery Boundary

No Ringer implementation is selected for this documentation-only update.
Production-risk work remains read-only for delegated lanes. Future execution
requires dependency-ready task IDs, disjoint paths, frozen scope, explicit
checks, and separate approvals for every production mutation.

## Reactivation Preconditions

1. Explicitly authorize synchronization of the reopened Issue body and Project
   fields before tracked execution advances.
2. Refresh all time-sensitive upstream, image, client, host, route, DNS,
   certificate, backup, and capacity facts.
3. Pass local contracts and the separately approved route-coexistence
   experiment before disabled installation.
4. Keep production activation, owner admission, canary admission, and expansion
   separately authorized.
