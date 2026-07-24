# Operational Data Model: Hermes v0.19 Upgrade

This feature adds no application database entity. The model below defines the
operational records required to make the rollout reproducible and auditable.

## UpstreamRelease

- `release_tag`: `v2026.7.20`
- `runtime_version`: `0.19.0`
- `source_commit`: immutable Git commit
- `published_at`: release timestamp
- `oci_index_digest`: immutable multi-architecture digest
- `arm64_manifest_digest`: immutable Linux ARM64 child digest
- `config_schema`: integer reported by the image
- `reviewed_surfaces`: gateway, dashboard, auth, cron, MCP, skills, browser,
  delivery, approvals, models/providers, security

## DerivedImage

- `tag`: `overnightdesk/hermes-agent:0.19.0-coder`
- `base_ref`: immutable `UpstreamRelease.oci_index_digest`
- `source_path`: `infra/hermes-coder/Dockerfile`
- `image_id`: captured after build
- `created_at`: captured after build
- `added_capabilities`: GitHub CLI and git identity bootstrap
- `secret_free`: required boolean

## RuntimeCandidate

- `runtime`: one of `hermes-mitchel`, `hermes-walter`, `hermes-titus`
- `volume`: exact existing named volume
- `launcher`: exact repository/volume-provided entrypoint
- `image`: current or candidate `DerivedImage`
- `config_version`: expected `33`
- `approval_mode`: required `manual`
- `cron_approval_mode`: required `deny`
- `auth_provider`: existing Basic or self-hosted OIDC policy
- `provider_model`: existing tenant-specific provider/model tuple
- `schedules`: metadata-only inventory and active count
- `tools`: expected tenant-specific contract
- `health`: version, gateway, dashboard, cron, MCP, and error evidence

### State transitions

`inventoried -> staged -> staging_qualified -> cutover_started ->
production_qualified -> observed -> accepted`

Failure at or after `cutover_started` transitions only the affected runtime to
`rollback_started -> rollback_qualified`.

## RollbackHandle

- `runtime`: owning runtime
- `previous_image`: exact v0.18.0 derived image
- `previous_container`: retained stopped/renamed container when applicable
- `config_backup`: timestamped, permission-restricted exact file backup
- `launcher_backup`: exact installed launcher/source backup
- `volume`: retained named volume; never deleted
- `availability`: present and verified through observation

## QualificationRecord

- `timestamp`
- `scope`: staging, runtime cutover, observation, or closeout
- `git_sha`: exact merged owning source
- `upstream_digest`
- `derived_image_id`
- `runtime_versions`
- `health_summary`
- `auth_summary`
- `approval_summary`
- `volume_summary`
- `unrelated_container_summary`
- `bounded_error_summary`
- `rollback_handles`
- `owner_gate`: complete, pending, or not required
- `secrets_or_message_content`: always absent
