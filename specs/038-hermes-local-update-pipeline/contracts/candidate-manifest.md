# Candidate Manifest Contract

The local runner accepts one YAML document. It must contain the following
shape; additional keys are rejected unless explicitly added to the schema.

```yaml
schema_version: 1
candidate_id: hermes-0.20.0-coder-2026-08-07
upstream:
  tag: v2026.8.3
  version: 0.20.0
  source_commit: 7de39e700d2c329e15d32eb0b96e2f7cdd9fbdb2
  oci_index: nousresearch/hermes-agent@sha256:<digest>
  arm64_child: sha256:<digest>
derived:
  reference: overnightdesk/hermes-agent:0.20.0-coder
  architecture: linux/arm64
policy:
  approvals_mode: manual
  cron_mode: deny
agents:
  - walter
  - titus
  - mitchel
```

Validation must reject missing or empty identity fields, non-digest image
references, unsupported architecture, an agent set other than the three named
runtimes, and approval policy broader than the current invariant.

The manifest identifies a candidate; it does not contain credentials, Phase
paths, local environment values, or live container identifiers.
