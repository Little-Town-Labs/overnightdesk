<!--
Sync Impact Report
- Version change: 2.0.0 -> 3.0.0
- Modified principles:
  - The Customer's Data is Sacred -> Business Data and Use-Case Boundaries Are Sacred
  - Security is a Feature, Not a Checkbox -> Least Privilege Is the Default
  - The Ops Agent Acts; The Owner Decides -> Agents Assist; Accountable People Decide
  - Simple Over Clever -> Named Workloads Over Dynamic Hosting
  - The Business Pays for Itself Before It Grows -> Operate for the Current Business
  - Honesty with Customers -> Operational Truth Is Durable
  - The Owner's Time is Protected -> Recoverability Before Automation
  - Platform Quality Drives Retention -> Workspace Quality Sustains the Business
- Added sections:
  - Internal workspace identity and membership
  - Human-approved production change boundary
  - Dynamic hosting prohibition on aegis-prod
  - Retirement and rollback requirements
- Removed sections:
  - External customer signup, billing, and subscription-driven provisioning policy
  - Autonomous Stripe-to-container lifecycle
  - Customer self-service hosting and BYOS product requirements
- Templates reviewed:
  - .specify/templates/plan-template.md - compatible; no change required
  - .specify/templates/spec-template.md - compatible; no change required
  - .specify/templates/tasks-template.md - compatible; no change required
  - .specify/templates/checklist-template.md - compatible; no change required
- Runtime guidance requiring synchronization in Feature 028:
  - README.md
  - PRD.md
  - AGENTS.md active-plan pointer
  - overnightdesk-platform-standard inventory, decisions, and runbooks
- Deferred follow-up:
  - Legacy customer signup, Stripe, and self-service provisioning code requires a
    separately verified retirement slice; it must remain inert in the meantime.
-->

# OvernightDesk Platform Constitution

> **v3.0.0 (2026-07-25) — Internal business production plane.**
> OvernightDesk is an authenticated internal workspace for Gary Brown, Austin,
> and explicitly approved collaborators. Aegis hosts named business runtimes;
> it is not a general customer container-hosting platform.

**Owner:** Gary Brown / Little Town Labs

**Ratified:** 2026-03-21

**Last Amended:** 2026-07-25

## Part I: Core Principles

### Principle 1: Business Data and Use-Case Boundaries Are Sacred

- Each business runtime MUST have one explicit use case, primary-memory
  boundary, persistent volume boundary, secret scope, and access policy.
- Sharing access to a runtime MUST use separate authenticated user identities
  and explicit membership. People MUST NOT share passwords, session cookies,
  recovery codes, API keys, or service credentials.
- Titus is the shared Timeless Tech Solutions workspace for Gary and Austin.
  Their authorization MUST remain independently grantable, auditable, and
  revocable.
- Walter remains the Aegis and OvernightDesk platform-operations runtime.
  Mitchel/Trevor remains a separate business-workflow and data boundary.
- Runtime-local conversations, memory, and business records MUST NOT be merged
  merely because a person is authorized to multiple workspaces.
- Business records MUST remain in their owning systems. Prompts and agent
  memory MUST NOT become the sole source of truth for operational, financial,
  customer, or prospect data.

**Rationale:** Shared work requires shared access, not shared identity. Clear
use-case and data boundaries prevent accidental disclosure and make ownership,
recovery, and revocation understandable.

### Principle 2: Least Privilege Is the Default

- No internal application container may mount the Docker socket.
- Aegis MUST NOT expose an unauthenticated or cleartext management API.
- Dynamic container-creation authority MUST NOT remain active without a
  current, owner-approved business requirement and a separate architecture
  decision.
- Secrets MUST live in Phase or another approved secret store and MUST be
  scoped to the exact runtime or service that consumes them.
- Service tokens MUST NOT be placed in Git, images, logs, documentation,
  command output, general agent memory, or broad shared environments.
- Public ingress MUST terminate TLS and route only to explicitly approved
  surfaces. Internal-only services MUST publish no host ports unless a
  documented exception is accepted.
- Agent and model output is untrusted input. It MUST NOT directly authorize
  shell execution, production mutation, credential access, or outbound
  business action.

**Rationale:** A compromised business application must not become a path to
the host, another workspace, or another person's credentials.

### Principle 3: Agents Assist; Accountable People Decide

- High-impact changes to production, identity, secrets, payments, outreach,
  business records, or runtime lifecycle MUST require explicit human approval.
- Walter may coordinate platform operations and communicate status, but Walter
  MUST NOT gain implicit authority merely by being the platform persona.
- New business runtimes MUST be deliberately approved, named, documented,
  deployed, and assigned an accountable owner.
- Ambiguous or novel conditions MUST fail closed, preserve evidence, and
  request direction rather than inventing recovery actions.
- Owner-facing operational notifications MUST use the approved communication
  path and identify what changed, what was verified, and what remains.

**Rationale:** Agents improve speed and consistency; they do not replace
business accountability.

### Principle 4: Named Workloads Over Dynamic Hosting

- Aegis is a production plane for a small set of named business workloads.
- Each runtime MUST be represented by deterministic source, a documented
  deployment procedure, an explicit lifecycle owner, and a rollback handle.
- Production runtime changes MUST use reviewed scripts, systemd units, or
  declarative Compose configuration. Ad hoc long-lived containers are not an
  accepted operating model.
- External customer self-service provisioning and general container hosting
  are out of scope.
- If a customer-hosting product is reconsidered, it MUST be designed as a
  separate service and isolation boundary rather than reactivating dormant
  authority on the business production plane.

**Rationale:** The current business benefits from predictable, reviewable
operations. A dormant multi-tenant control plane adds privilege and failure
modes without delivering present value.

### Principle 5: Operate for the Current Business

- Product and infrastructure work MUST serve the active internal business
  workspace and named runtime use cases.
- Features justified only by hypothetical future external customers MUST NOT
  expand production authority or operational burden.
- Existing customer signup, billing, and self-service provisioning code MUST
  remain inert until removed through a tested migration.
- New paid infrastructure MUST have a current operational or business
  justification and an accountable owner.

**Rationale:** Historical product assumptions must not govern current security
or spending.

### Principle 6: Operational Truth Is Durable

- The platform standard is the canonical description of deployed services,
  networks, secrets boundaries, identities, and runbooks.
- Production changes MUST be recorded in the suite deployment ledger.
- Runtime claims MUST be backed by current health, access, log, configuration,
  or database evidence.
- Retired systems MUST be marked retired in source and standards; they MUST
  NOT remain documented as active merely because their code is retained.
- Incident knowledge MUST be preserved in the approved operations knowledge
  store rather than depending on an otherwise unused service or database.

**Rationale:** Operators and agents can only make safe decisions when the
record matches the live system.

### Principle 7: Recoverability Before Automation

- Every production mutation MUST have a bounded rollback path established
  before execution.
- Stateful service retirement MUST preserve a verified backup and a defined
  observation window before data volumes or secrets are deleted.
- Backups MUST be encrypted, stored off-box, and periodically exercised
  through a separate restore drill.
- Startup and shutdown ordering MUST respect database readiness and known
  service dependencies.
- Automation that cannot prove completion or alert on failure MUST NOT own a
  production-critical lifecycle.

**Rationale:** A smaller production plane is only safer when it can be restored
and its failures are visible.

### Principle 8: Workspace Quality Sustains the Business

- Authorized users MUST reach the correct workspace through authenticated,
  membership-scoped access.
- Empty, suspended, revoked, expired, ambiguous, or cross-workspace access
  states MUST fail closed.
- Status presented to users MUST reflect live runtime truth.
- Changes to shared workspace access MUST test both authorized access and
  denial for non-members.
- Internal workspace design MUST remain understandable to its business users;
  implementation complexity that does not improve safety or daily work is
  rejected.

**Rationale:** The internal workspace is operational infrastructure. Confusing
or unreliable access directly impairs the business.

## Part II: Implementation Pillars

### Pillar A: Identity and Membership

- Better Auth and the canonical use-case/runtime membership model remain the
  web identity and authorization boundaries.
- Each person MUST authenticate using their own account.
- Membership grants MUST bind to the exact active workspace and runtime.
- Shared runtime access MUST NOT merge personal identity, sessions, recovery
  material, or unrelated workspace membership.
- Authorization changes MUST be metadata-audited and independently revocable.

### Pillar B: Production Runtime Management

- Runtime creation, retirement, and authority changes require explicit owner
  approval.
- Launchers MUST enforce the approved user, capabilities, read-only policy,
  resource limits, network membership, volumes, and secret-loading boundary.
- Production services MUST be reproducible from version-controlled source.
- No active runtime may depend on an unused general-purpose orchestrator or
  Docker socket proxy.
- Retired control-plane code may remain in Git for historical reference, but
  MUST be clearly excluded from active deployment and update procedures.
- New first-party services, agents, operational daemons, CLIs, and
  infrastructure automation SHOULD be implemented in Go when practical.
  Browser UI, a small change inside an established non-Go service, an upstream
  integration constraint, or another documented engineering reason may justify
  an exception. This preference MUST NOT trigger an unplanned rewrite of a
  stable service.

### Pillar C: Data and Secret Custody

- Application data access MUST use the owning repository's established data
  layer and parameterized queries.
- Runtime data MUST remain in its dedicated database or volume.
- Phase scopes and service accounts MUST be least privilege.
- Secret rotation MUST not require placing secret values in source control.
- Retirement exports MUST exclude credentials and retain only operationally
  necessary records.

### Pillar D: Interface and Ingress Security

- Every protected API or web route MUST authenticate and authorize the caller.
- Public exceptions such as detail-free health endpoints MUST be explicit and
  narrowly routed.
- Management and provisioning endpoints MUST NOT be exposed publicly merely
  because wildcard DNS resolves their hostname.
- TLS, secure cookies, consistent denial responses, input validation, and rate
  limits remain required at public boundaries.
- Removed services MUST receive an explicit deny response where wildcard or
  default routing could otherwise expose a different application.

### Pillar E: Test-First Delivery

- Behavioral changes MUST begin with a failing contract, unit, integration, or
  qualification test.
- Configuration-only and documentation-only changes MUST use deterministic
  validation appropriate to their format and impact.
- Production retirement requires preflight evidence, negative reachability
  checks, dependent-service health checks, rollback rehearsal, and an
  observation window.
- Affected repositories MUST pass their scoped tests and build checks before
  publication or deployment.

## Part III: Operational Constraints

### Aegis Production Boundary

- Aegis hosts named OvernightDesk and Timeless Tech Solutions control,
  collaboration, communication, security, and supporting data services.
- Aegis MUST NOT become a general customer workload host.
- Client or customer workload and data planes normally belong on separately
  approved infrastructure outside `aegis-prod`, such as an engagement-specific
  Azure, Vultr, or other provider environment. The selected provider MUST fit
  that engagement's requirements and have its own identity, networking,
  secret, data-custody, backup, recovery, cost, and lifecycle boundaries.
- Hosting a customer workload or customer data on `aegis-prod` is prohibited
  unless the owner approves a documented exception after security, capacity,
  contractual, data-custody, and recovery review. Existing internal business
  services are not precedent for such an exception.
- SSH and Tailscale administration remain distinct from application access.

### Retirement Requirements

Before stopping a production component:

1. Confirm current callers, database records, scheduled jobs, ingress routes,
   and dependent health checks.
2. Preserve configuration, required records, and rollback evidence without
   exporting secrets.
3. Remove or replace active dependencies.
4. Validate the replacement or absence contract.
5. Stop components without deleting containers, volumes, images, or secrets.
6. Observe the production plane for the documented period.
7. Delete retained state only through a later, explicitly approved cleanup.

### Internal Workspace Scope

- OvernightDesk.com is the authenticated internal business shell and
  workspace launcher.
- Walter is the platform-operations workspace.
- Titus is the shared Gary-and-Austin Timeless Tech Solutions workspace.
- Mitchel/Trevor remains a separate named business workflow boundary.
- External customer signup, billing, plan selection, and automated tenant
  provisioning are not active product capabilities.

## Part IV: Governance

1. The owner approves or rejects constitutional amendments.
2. Amendments MUST describe affected principles, migration impact, runtime
   consequences, and rollback posture.
3. Versioning follows semantic versioning:
   - **MAJOR** for incompatible business-model or principle changes.
   - **MINOR** for new pillars or materially expanded requirements.
   - **PATCH** for non-semantic clarification.
4. Every substantial feature plan MUST include a constitution check before
   implementation and after design.
5. The platform standard and active PRD MUST be synchronized before a
   production architecture change is considered complete.
6. Production deployment requires scoped verification, security review, and a
   deployment-ledger entry.

## Glossary

| Term | Definition |
|------|------------|
| **Business runtime** | A named Hermes process with one explicit use case, memory boundary, persistent state boundary, and access policy. |
| **Internal workspace** | The authenticated OvernightDesk web shell and approved runtime interfaces used by Gary, Austin, and explicitly authorized collaborators. |
| **Walter** | The OvernightDesk and Aegis platform-operations runtime and default platform persona. |
| **Titus** | The shared Timeless Tech Solutions operations and collaboration runtime used by separately authenticated members including Gary and Austin. |
| **Mitchel/Trevor** | A separate business workflow and data boundary for Mitchel-owned operations. |
| **Aegis** | The Oracle Cloud business production plane hosting named OvernightDesk and Timeless Tech Solutions services. |
| **Platform standard** | The canonical repository describing deployed services, boundaries, identities, secrets custody, and runbooks. |
| **Human-approved deployment** | A production lifecycle change that begins only after explicit authorization and uses reviewed, deterministic source. |
| **Retired service** | Code or state retained for evidence or rollback but excluded from active routing, startup, and operating procedures. |

## Amendment History

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-03-21 | Initial customer-facing platform constitution. |
| 2.0.0 | 2026-04-24 | Replaced the custom tenant engine with Hermes and moved runtime secrets to Phase. |
| 3.0.0 | 2026-07-25 | Reframed OvernightDesk as an internal business workspace; prohibited general customer hosting on Aegis; established named runtimes, separate member identities, human-approved deployment, and reversible retirement requirements. |

**Version**: 3.0.0 | **Ratified**: 2026-03-21 | **Last Amended**: 2026-07-25
