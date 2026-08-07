# Candidate Manifest Contract

The local runner accepts one YAML document. It must contain the following
shape; additional keys are rejected unless explicitly added to the schema.

```yaml
schema_version: 1
candidate_id: hermes-0.19.0-2026-07-20
upstream:
  tag: v2026.7.20
  version: 0.19.0
  source_commit: 3ef6bbd201263d354fd83ec55b3c306ded2eb72a
  oci_index: nousresearch/hermes-agent@sha256:<digest>
  arm64_child: sha256:<digest>
derived:
  reference: overnightdesk/hermes-agent:0.19.0-coder
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
