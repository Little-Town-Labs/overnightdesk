# Feature 041 Research: OCI Control-Plane Operations

**Date:** 2026-08-20
**Scope:** Official Oracle Cloud Infrastructure and Phase documentation only.
**Safety boundary:** No credentials, OCI tenancy, Aegis-Prod host, or production system was accessed.

## Decision

### 1. OCI authentication and request evidence

Use a narrow OCI client that delegates request signing to an official OCI SDK
signer where practical, while keeping the exposed operation surface limited to
the approved endpoints. The client must load the matching RSA private key in
PEM format at runtime, never persist or print it, and identify the registered
key with the tenancy OCID, user OCID, and public-key fingerprint. OCI requires
RSA-SHA256 signatures and requires all API requests to be signed. GET/DELETE
signatures include `(request-target)`, `host`, and `date` or `x-date`; requests
with bodies additionally sign `x-content-sha256`, `content-type`, and
`content-length`.

Capture the OCI `opc-request-id` response header for every request, including
each page and each vulnerability-detail call, and associate it with an
application run ID. Treat request IDs as operational evidence, not as secret
material. Keep clock-skew, TLS, bounded timeout, and bounded retry behavior in
the client boundary.

**Rationale:** Oracle verifies the uploaded public key against the private key
used to sign requests. Keeping signing and request-ID handling in one boundary
reduces authentication drift and makes an evidence run supportable without
exposing key material.

The official Go SDK exposes `common.NewRawConfigurationProvider`, which accepts
the PEM private key as a string and parses it into the signer. This supports the
host-local design without requiring an OCI config file or durable private-key
path; the exact SDK patch is pinned in the implementation repository.
The selected `github.com/oracle/oci-go-sdk/v65@v65.123.2` module declares Go
1.25, so the companion module baseline must be Go 1.25 rather than the initial
Go 1.24 scaffold.

**Alternatives:**

- Hand-written signing code is possible, but it increases risk around canonical
  query ordering, URL encoding, required headers, and RSA implementation.
- An OCI CLI subprocess would reduce client code but makes structured request
  evidence, response validation, and controlled retries harder to own.
- Instance principals or other OCI auth modes are not selected because the
  feature specifically requires the registered PEM key-pair model and the
  project constitution requires an explicit secret boundary.

### 2. Vulnerability inventory and complete remediation metadata

Implement a bounded two-stage read path:

1. Call `ListHostVulnerabilities` in the approved compartment. The list
   returns `HostVulnerabilitySummary` records and supports filters such as
   severity, CVE reference, vulnerability type, sorting, `limit`, and `page`.
2. For every returned host-vulnerability ID, call `GetHostVulnerability` to
   retrieve the detailed issue data, including CVE description and available
   remediation. Preserve the list record, detail record, source ID, endpoint,
   and both OCI request IDs together.

The current SDK model exposes CVE-level solution/patchability fields but does
not guarantee package name or fixed-version fields on `HostVulnerability`.
Package-level maintenance grouping must therefore preserve absent package
metadata as unresolved; adding an OS Management Hub enrichment call is a
separate scope decision, not an implicit inference from the VSS response.

Follow OCI list pagination by repeating the same GET with the `page` query
parameter set to `opc-next-page`. A page may be empty while more results
remain; stop only when the response has no `opc-next-page` header. Do not mark
an interrupted or partially completed run as a complete inventory. Keep detail
fetch retries bounded and fail the affected record visibly rather than dropping
it.

**Rationale:** The list operation is a summary surface; Oracle's host-scan
detail documentation places cause and remediation behind the detail operation.
The two-stage model is therefore required for the grouping requirement and for
reproducible evidence of unresolved records.

**Alternatives:**

- Reading only host scan reports would couple the implementation to a report
  navigation model and would not provide the stable list/detail API contract
  needed for grouping.
- Calling only the list endpoint is insufficient because it cannot establish
  complete cause/remediation metadata.
- Treating an empty page as end-of-results is incorrect under OCI pagination.

### 3. Boot-volume backup preflight

Use `ListBootVolumeBackups` with the approved compartment and exact
`bootVolumeId` filter. Page through all results, then validate locally that the
selected record has the exact target boot-volume OCID, `lifecycleState` equal
to `AVAILABLE`, and an application-defined acceptable age. Preserve the backup
OCID, source boot-volume OCID, lifecycle state, creation time, source type,
backup type, and request ID in the evidence record. If a copied backup is
relevant, retain and validate `sourceBootVolumeBackupId` as well.

The list API's documented filters include `bootVolumeId`, exact `displayName`,
and `sourceBootVolumeBackupId`; the returned model exposes lifecycle states
including `REQUEST_RECEIVED`, `CREATING`, `AVAILABLE`, `TERMINATING`,
`TERMINATED`, and `FAULTY`. The read-only IAM policy should begin with
`BOOT_VOLUME_BACKUP_INSPECT` and `VOLUME_INSPECT`; create, update, delete, and
move permissions are not part of inventory.

**Rationale:** Exact source filtering prevents accepting a backup from another
boot volume. Local state and age validation makes the production precondition
explicit even where the list API does not provide every desired policy filter.

**Alternatives:**

- Listing all compartment backups and selecting by display name is unsafe
  because names are not the target identity.
- Creating a new backup during inventory would turn a read-only phase into a
  mutation and is therefore deferred to a separately approved operation.
- Console-only verification is not reproducible as machine-readable evidence.

### 4. OS Management Hub package updates and work requests

Keep package mutation out of the initial read-only slice. For the later P2
phase, use `UpdatePackagesOnManagedInstance` against one exact managed-instance
OCID with an explicit package list and update types. Treat the call as an
asynchronous operation: capture the initial `opc-request-id` and
`opc-work-request-id`, poll the OS Management Hub work-request status, and
record the terminal result, errors, affected resources, and follow-up
verification requirements. The documented OS Management Hub states are
`ACCEPTED`, `IN_PROGRESS`, `SUCCEEDED`, `FAILED`, `CANCELING`, and `CANCELED`.

The narrow update permission is `OSMH_MANAGED_INSTANCE_INSTALL_UPDATE` for
`UpdatePackagesOnManagedInstance`; read-only discovery uses the corresponding
managed-instance inspect/read permissions. The implementation must not use
compartment-wide update-all operations for the Aegis target.

**Rationale:** OCI work requests separate acceptance from terminal completion.
Persisting both IDs and treating an ambiguous terminal state as unknown avoids
claiming success or automatically duplicating a production mutation.

**Alternatives:**

- A scheduled job adds scheduling and another lifecycle surface that is not
  needed for the first bounded operation.
- `UpdateAllPackagesOnManagedInstancesInCompartment` is broader than the exact
  target allowlist and is rejected for this project.
- Direct SSH/package-manager execution would bypass the selected OCI control
  plane and its work-request evidence.

### 5. Phase service-account custody and runtime injection

Create a dedicated non-human Phase service account for the OCI integration,
with explicit access only to the dedicated App and required Environment. Do
not use a human PAT. Prefer a custom least-privilege role that grants only the
secret read capability needed by the integration; the built-in Phase `Service`
role provides application-level secret full access and is broader than the
desired default. Use one token per consuming service and keep token creation,
rotation, and revocation under the accountable owner.

Use Phase runtime injection at process start (`phase run --app APP --env ENV
-- <binary>`) or the equivalent approved host launcher, with explicit
App/Environment context and a pinned CLI/runtime version. For this host-local,
non-container CLI, expose only the named OCI PEM secret to the one-shot process
and do not use `phase secrets export`, `eval`, or a durable `.env` file. Phase's
documentation notes that environment variables can be available to all
processes and can be exposed in logs; the launcher must therefore use a
dedicated process/user boundary and never print or dump its environment. If a
future container deployment is approved, native file-mounted container
secrets—not environment export—must be evaluated separately.

Phase supports absolute secret paths and API filtering by `app_id`, `env`,
`path`, and `key`. The research does **not** treat a path filter as a security
boundary: the official docs describe it as a query selector and do not
establish path-level RBAC semantics. The roadmap must therefore scope access
primarily through a dedicated App, Environment, service account, role, and
service boundary until path authorization is verified in a non-production
fixture.

**Rationale:** This follows the OvernightDesk constitution's least-privilege
and secret-custody requirements while retaining runtime injection and avoiding
private-key files in Git, images, logs, or durable application output.

**Alternatives:**

- A human PAT is rejected because it couples production access to a person's
  identity and grants that person's broader Phase access.
- The default Phase `Service` role is simpler but grants more secret authority
  than this integration needs.
- Exporting all secrets to a host `.env` file is rejected because it creates a
  durable plaintext copy and broadens the process boundary.
- REST API retrieval is viable for a custom launcher, but `phase run` is the
  smaller first implementation if the service can use the CLI boundary.

## Roadmap implications

- Phase 0/1: build fixtures and contract tests for the signer boundary, OCI
  pagination, summary-to-detail vulnerability retrieval, backup preflight, and
  sanitization. Use no live credentials.
- Read-only MVP: inventory backups and complete host-vulnerability details,
  preserve request IDs, validate response shapes, and produce deterministic
  grouping input/output.
- P2 mutation: design only after the owner has approved the exact OCI and Phase
  identities, IAM policy, target allowlist, backup age window, work-request
  timeout, rollback handle, and post-update verification.
- Production execution on this machine requires a separate approval and
  deployment/runbook step; this research does not authorize provisioning or
  mutation.

## Unresolved questions

1. What exact OCI tenancy, region, compartment, compute instance, boot volume,
   and OS Management Hub managed-instance OCIDs are in scope?
2. Which OCI IAM user/group or non-human identity will own the registered PEM
   public key, and what is the reviewed read-only policy statement?
3. Is the Aegis host registered and healthy in OS Management Hub, and which
   package names/update types map to the vulnerability records?
4. What Phase App, Environment, and service-account role will be used? Is the
   Phase deployment cloud-hosted or self-hosted, and how will the token be
   injected at service start on this machine?
5. What non-production fixture will verify whether Phase access is effectively
   constrained by paths, rather than merely filtered by path in the API?
6. What backup recency window, maintenance window, rollback reference, and
   post-update OCI/host-scan verification constitute a current precondition?
7. Do all target vulnerability details expose package identity and fixed-version
   data needed for deterministic grouping, or must unresolved groups retain
   records lacking those fields?

## Sources

### OCI signing and request IDs

- <https://docs.oracle.com/en-us/iaas/Content/API/Concepts/apisigningkey.htm>
- <https://docs.oracle.com/en-us/iaas/Content/General/Concepts/credentials.htm>
- <https://docs.oracle.com/en-us/iaas/Content/API/Concepts/signingrequests.htm>
- <https://docs.oracle.com/en-us/iaas/Content/API/Concepts/usingapi.htm>
- <https://docs.oracle.com/en-us/iaas/Content/API/Concepts/sdkconfig.htm>
- <https://github.com/oracle/oci-go-sdk/blob/master/common/configuration.go>
- <https://pkg.go.dev/github.com/oracle/oci-go-sdk/v65/common>

### Vulnerability Scanning

- <https://docs.oracle.com/en-us/iaas/tools/oci-cli/latest/oci_cli_docs/cmdref/vulnerability-scanning/host/vulnerability/list.html>
- <https://docs.oracle.com/en-us/iaas/tools/oci-cli/latest/oci_cli_docs/cmdref/vulnerability-scanning/host/vulnerability/get.html>
- <https://docs.oracle.com/en-us/iaas/Content/scanning/using/get_host_scan_report_vulner_details.htm>
- <https://docs.oracle.com/en-us/iaas/tools/python/latest/api/vulnerability_scanning/client/oci.vulnerability_scanning.VulnerabilityScanningClient.html>
- <https://docs.oracle.com/en-us/iaas/Content/API/Concepts/usingapi.htm>

### Boot-volume backups

- <https://docs.oracle.com/en-us/iaas/Content/Block/Tasks/list-bv-boot-volume-backup.htm>
- <https://docs.oracle.com/en-us/iaas/tools/python/latest/api/core/client/oci.core.BlockstorageClient.html>
- <https://docs.oracle.com/en-us/iaas/tools/python/latest/api/core/models/oci.core.models.BootVolumeBackup.html>
- <https://docs.oracle.com/en-us/iaas/Content/Block/Concepts/bootvolumebackups.htm>
- <https://docs.oracle.com/en-us/iaas/Content/Identity/Reference/corepolicyreference.htm>

### OS Management Hub

- <https://docs.oracle.com/en-us/iaas/tools/oci-cli/latest/oci_cli_docs/cmdref/os-management-hub/managed-instance/update-packages.html>
- <https://docs.oracle.com/en-us/iaas/tools/python/latest/api/os_management_hub/client/oci.os_management_hub.ManagedInstanceClient.html>
- <https://docs.oracle.com/en-us/iaas/tools/python/latest/api/os_management_hub/client/oci.os_management_hub.ManagedInstanceClientCompositeOperations.html>
- <https://docs.oracle.com/en-us/iaas/Content/API/Concepts/workrequests.htm>
- <https://docs.oracle.com/en-us/iaas/osmh/doc/policies-reference.htm>

### Phase

- <https://docs.phase.dev/access-control/service-accounts>
- <https://docs.phase.dev/access-control/roles>
- <https://docs.phase.dev/access-control/authentication>
- <https://docs.phase.dev/access-control/authentication/tokens>
- <https://docs.phase.dev/public-api>
- <https://docs.phase.dev/public-api/secrets>
- <https://docs.phase.dev/console/environments>
- <https://docs.phase.dev/integrations/platforms/docker-compose>
- <https://docs.phase.dev/integrations/platforms/docker>
- <https://docs.phase.dev/cli/usage>
