# Quickstart and Qualification Plan

This project is a host-local CLI. The commands below are planning contracts;
they must operate without credentials for fixture mode and must not contact OCI
unless a separately approved live qualification is being performed.

## Fixture-Only MVP

From `/home/powerbox2/src/overnightdesk-maintenance`:

```bash
go test ./...
go test -race ./...
go vet ./...
go run ./cmd/overnightdesk-maintenance inventory \
  --config config.example.json \
  --input fixtures/oci-inventory.json \
  --output ./tmp/evidence.json
go run ./cmd/overnightdesk-maintenance group \
  --input ./tmp/evidence.json \
  --output ./tmp/maintenance-plan.json
```

Fixture mode must prove:

- all OCI pages are consumed within configured ceilings;
- summary/detail records are normalized and schema-validated;
- malformed records are preserved as unresolved, not discarded;
- grouping is stable across repeated runs and golden outputs;
- interrupted and truncated runs are not marked complete;
- private-key, Phase-token, authorization-header, and full-config sentinels do
  not occur in stdout, stderr, or exported JSON;
- no listener is opened and no Docker socket is accessed.

## Host-Local Read-Only Preflight

Before any live call, an operator must verify metadata only:

```bash
./bin/overnightdesk-maintenance preflight \
  --config /etc/overnightdesk/oci-maintenance/config.json \
  --mode read-only
```

The preflight output may include region, compartment OCID, target OCIDs,
configured limits, required IAM policy names, Phase reference metadata, backup
evidence eligibility, the planned operation, verification steps, and the
planned endpoints. It must not include private-key content, Phase tokens,
authorization headers, or full config contents.

## Separately Approved Live Inventory

Live inventory is disabled unless the owner-approved run record names the
machine, config revision, read-only OCI identity, Phase reference, and evidence
destination. The operator then runs the reviewed command from the approved
machine and records only sanitized results and OCI request IDs in the deployment
ledger.

No live mutation command is part of this quickstart. A future mutation
quickstart must be added only after a separate approval and must include backup,
allowlist, rollback, work-request, and post-update scan gates.

## Rollback

The MVP has no production mutation to roll back. If the host-local binary or
runbook is installed incorrectly, disable/remove only the new tool's host
installation and preserve evidence and the previous approved source. Do not
restart, reconfigure, or delete unrelated Aegis runtimes, volumes, or secrets.
