# Contract: Transcript Content Runtime

## Disabled projection

The existing six meeting-discovery fields remain the complete runtime document.
The loader does not export the Titus core or email-intake Phase paths.

## Enabled projection

The root-owned marker
`/etc/overnightdesk/titus-meeting-transcript-content.enabled` must be a regular,
non-symlink, root-owned file with mode 0444 and exact empty content.

When valid, the loader additionally exports:

- `/agents/hermes-titus/runtime` and selects `SECURITY_SERVICE_TOKEN` only;
- `/agents/hermes-email-intake/titus` and selects `HERMES_API_KEY` and the exact
  private `HERMES_BASE_URL` only;
- fixed `TRANSCRIPT_CONTENT_ENABLED=true` and fixed content bounds.

The combined file remains root-owned, group 10003, mode 0440. No secret is
placed in Docker environment metadata.

## Lifecycle actions

- `install-disabled`: install code and retain/remove no activation marker.
- `verify-disabled`: prove metadata health and absence of content credentials.
- `enable-content`: create the marker atomically, restart only the worker, and
  verify active projection.
- `verify-content`: prove aggregate content state and service hardening.
- `restart-verify`: prove cursor and processed-output idempotency.
- `disable-content`: remove only the marker, restart only the worker, and retain
  metadata discovery plus state.
- `rollback`: disable the whole worker only when separately requested.
