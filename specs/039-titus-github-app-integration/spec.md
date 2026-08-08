# Feature Specification: Titus GitHub App Integration

**Feature Branch**: `038-titus-github-integration`

**Created**: 2026-08-08

**Status**: Implemented pending review

**Input**: Titus needs the organization-owned GitHub Apps stored in Phase to be
available inside the Titus runtime without exposing either private key or
granting authority beyond the separately approved Control Tower capability.

## User Scenarios & Testing

### User Story 1 - Load Titus's GitHub App identity (Priority: P1)

As the Titus operator, I want the configured GitHub App identity and repository
allowlist available to Titus so that its existing GitHub integration can
authenticate against the selected repositories.

**Why this priority**: Without runtime projection, the completed Phase setup
cannot be used by Titus.

**Independent Test**: A synthetic Phase export produces a ready Titus runtime
with non-secret metadata and a separate protected private-key file, while no
private-key value appears in the runtime environment or output.

**Acceptance Scenarios**:

1. **Given** the exact `/agents/github` profiles are valid, **When** Titus loads
   Phase, **Then** each App's metadata is available and each adapter can read
   its own dedicated protected key path.
2. **Given** the profile is absent, malformed, or contains unknown keys,
   **When** Titus loads Phase, **Then** GitHub is disabled or invalid without
   stopping Titus or removing sibling channel availability.

### User Story 2 - Verify GitHub provider readiness (Priority: P1)

As the Titus operator, I want deployment verification to prove that the GitHub
App provider is authenticated and covers the configured repository allowlist so
that a ready report reflects real connectivity.

**Why this priority**: Secret presence alone does not prove a usable provider.

**Independent Test**: The Titus verifier obtains a read-only installation
identity and checks the configured repository coverage without printing tokens
or private material.

**Acceptance Scenarios**:

1. **Given** a ready profile and reachable GitHub, **When** verification runs,
   **Then** it reports only redacted provider, organization, and repository
   counts.
2. **Given** revoked credentials, an unavailable provider, or incomplete
   installation coverage, **When** verification runs, **Then** it fails rather
   than reporting GitHub ready.

### User Story 3 - Preserve authority separation (Priority: P1)

As the Titus operator, I want GitHub credentials and Control Tower authority
kept separate so that loading an App cannot silently grant GitHub mutations.

**Why this priority**: The private key authenticates an identity; it must not
change the agent's approved authority boundary.

**Independent Test**: Runtime and documentation checks show the key is not an
environment value and the existing monitoring-only Control Tower profile is
unchanged.

**Acceptance Scenarios**:

1. **Given** GitHub metadata and private keys are present, **When** Titus
   starts, **Then** only the primary key is available through its dedicated
   read-only mount; the repository-manager profile remains host-only and no
   GitHub mutation capability is added.
2. **Given** the GitHub profile is revoked or disabled, **When** Titus starts,
   **Then** only the GitHub integration is disabled and other Titus surfaces
   remain available.

### Edge Cases

- Phase cannot export `/agents/github`: Titus remains healthy with GitHub
  disabled.
- The profile has an unknown key, invalid organization, empty allowlist, invalid
  identifier, or malformed PEM: GitHub is invalid/disabled and no metadata or
  key is projected.
- The GitHub installation does not cover every configured repository:
  verification fails closed.
- The provider is unreachable or the installation token is rejected:
  verification fails closed without exposing provider response content.

## Requirements

### Functional Requirements

- **FR-001**: Titus MUST read the exact Phase namespace `/agents/github`.
- **FR-002**: Titus MUST accept exactly the six approved primary GitHub App
  keys and, when present, exactly the six approved repository-manager App keys;
  unknown or malformed profiles MUST not stop sibling Titus channels.
- **FR-003**: Titus MUST keep both GitHub private keys out of the process
  environment, Docker configuration, logs, source control, and agent output.
- **FR-004**: Titus MUST expose only the valid primary App's non-secret
  metadata and repository allowlist to the general runtime. The valid
  repository-manager profile MUST remain in root-only host files for the
  host-only verifier.
- **FR-005**: Deployment verification MUST validate provider authentication and
  installation coverage for every configured repository before reporting GitHub
  ready.
- **FR-006**: The feature MUST NOT modify the Titus Control Tower capability
  profile or authorize GitHub mutations.
- **FR-007**: Documentation MUST describe setup, verification, revocation, and
  rollback without containing secret values.

### Key Entities

- **GitHub App profiles**: Phase-backed identities, installations,
  organizations, repository allowlists, and private keys for Titus.
- **Protected key files**: Host-only or runtime-only file boundaries that keep
  private keys out of environment variables; only the primary key is mounted
  into Titus.
- **GitHub readiness state**: Disabled, invalid, or ready state reported by
  Titus's projection and verifier.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Valid synthetic profiles project the primary non-key values into
  Titus and retain manager metadata/key material only in root-only host files,
  with zero private-key values in captured output.
- **SC-002**: Every malformed-profile test leaves the shared Titus startup
  path successful and projects zero GitHub credentials.
- **SC-003**: A ready verification checks provider authentication and 100% of
  the configured repository allowlist before reporting success.
- **SC-004**: Focused Titus contract and projection tests pass with no change to
  the existing Matrix, Telegram, Teams, email, memory, or Linear boundaries.

## Assumptions

- The Phase namespace `/agents/github` and its twelve key names are
  owner-approved.
- The pinned Hermes image already contains native GitHub App support that reads
  a private key path and exchanges it for a short-lived installation token.
- GitHub write authority, if ever needed, requires a separate explicit
  Control Tower capability and is out of scope here.
- Production deployment and restart remain a separate explicitly authorized
  handoff after review and merge.

## Non-goals

- Changing Walter, Mitchel, or any other runtime.
- Modifying Control Tower profiles, GitHub App permissions, installations,
  repositories, branches, issues, pull requests, or organization settings.
- Adding a PAT, GitHub CLI login, webhook, repository mirror, or database copy.
