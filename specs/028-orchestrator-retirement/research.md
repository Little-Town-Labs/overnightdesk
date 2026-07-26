# Research: Internal Workspace and Orchestrator Retirement

## Decision 1: Retire rather than isolate

**Decision**: Remove the platform orchestrator and Docker socket proxy from
active ingress, startup, dependencies, and operating procedures.

**Rationale**: Live inspection found no tenants, routes, operator credentials,
idempotency records, revoked tokens, or recent callers. The proxy exposes
write-capable container operations through a shared application network. A
dedicated proxy network would reduce reachability but preserve unused
host-control authority and maintenance burden.

**Alternatives rejected**:

- Isolate the proxy and orchestrator on a dedicated network: safer than the
  current topology, but still retains unused runtime mutation authority.
- Leave the services running but unroute the hostname: removes one ingress
  path but not lateral network access, startup risk, or Docker authority.

## Decision 2: Preserve incidents as static operations knowledge

**Decision**: Export the three existing `platform_incidents` rows into
`WHAT/platform-incidents.yaml` with only ID, service, symptom, root cause, fix,
learning, severity, and occurrence time. Make Ops search that file instead of
the retired database.

**Rationale**: Incident knowledge remains searchable without keeping an
otherwise unused database online. The selected fields are operational metadata
and avoid credentials, request bodies, or opaque payloads.

**Alternative rejected**: Copy incidents into the shared operations database.
That would require a new migration, ownership model, and retention policy for
only three static records.

## Decision 3: Remove Flight Recorder tools

**Decision**: Remove the four platform Flight Recorder MCP tools and their
token/base-URL configuration.

**Rationale**: The recorder has zero snapshots and exists only inside the
retired orchestrator. Presenting it as an active tool would create a permanently
degraded capability.

**Alternative rejected**: Return a permanent “retired” response. Static dead
tools add noise and imply a supported capability.

## Decision 4: Preserve rollback state without preserving startup

**Decision**: Before stopping services, capture a database dump, secret-free
incident export, Compose/Nginx configuration, container inspection metadata,
image identifiers, volume inventory, and prior restart policies. Change the
three container restart policies to `no`, then stop them without removing
containers, images, volumes, or secret paths.

**Rationale**: This makes retirement survive reboot while keeping a bounded,
evidence-backed rollback for 14 days.

**Alternative rejected**: `docker compose down` or `docker rm`. Both increase
rollback risk and can become destructive when flags or future Compose changes
are involved.

## Decision 5: Deny the old hostname explicitly

**Decision**: Keep an explicit Nginx server block for
`orchestrator.overnightdesk.com` that returns a detail-free `404` and proxies
nothing.

**Rationale**: Wildcard DNS may continue resolving the name. An explicit deny
prevents the request from falling through to another default virtual host.

## Decision 6: Separate Titus identities

**Decision**: Gary and Austin share Titus through distinct Better Auth accounts
and exact active Titus memberships. No credentials, recovery material, or
sessions are shared.

**Rationale**: Separate identities preserve attribution and allow either
membership to be revoked without interrupting the other.

**Activation boundary**: Creating or activating Austin's account and
membership requires his exact authenticated identity and its own owner-approved
membership operation. The retirement can establish the contract without
inventing that identity.

## Decision 7: Keep legacy provisioning source inert

**Decision**: Remove the live orchestrator/proxy deployment and document the
host-side provisioner as disabled for customer-hosting use. Complete deletion
of signup, Stripe, wizard, callback, and provisioner source is deferred to a
separate feature.

**Rationale**: The immediate security outcome is eliminating production
authority. Broad source deletion crosses product, billing, identity, and data
compatibility boundaries and should not be bundled into a production
retirement.

## Decision 8: Place customer planes outside Aegis

**Decision**: Future customer workloads and customer data normally run in
separately approved infrastructure outside `aegis-prod`. Azure, Vultr, or
another provider may be selected per engagement; this decision does not make
one provider universal.

**Rationale**: Aegis is the internal business control and workspace plane.
Separating customer planes gives each engagement an explicit contractual,
identity, networking, secret, data-custody, capacity, cost, backup, recovery,
and lifecycle boundary.

**Exception boundary**: Hosting customer workload or data on `aegis-prod`
requires a separately documented owner-approved exception after security,
capacity, contractual, data-custody, cost, and recovery review.
