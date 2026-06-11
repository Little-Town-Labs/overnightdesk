# OvernightDesk Post-Migration Follow-ups

Created: 2026-06-11

## P0 - Time-Sensitive Operations

- [x] Fix or confirm TLS renewal for `aegis-prod.overnightdesk.com`.
  - Renewed the Docker-managed certificate on 2026-06-11.
  - Nginx now serves cert serial `05D55E6666888B25618B5E2CAC9F01F5A503`,
    valid until 2026-09-09.
  - Installed and verified `overnightdesk-certbot-renew.timer`, which runs
    Docker certbot from `/opt/overnightdesk` and reloads `overnightdesk-nginx`.
  - Pre-renewal backup:
    `/home/ubuntu/certbot-backups/certbot-conf-20260611T145247Z.tgz`.

## P1 - Production Hygiene

- [x] Decide whether to prune Docker images on `aegis-prod`.
  - Performed targeted cleanup on 2026-06-11 instead of broad
    `docker image prune -a`.
  - Removed temporary `curlimages/curl:latest` image created by health checks.
  - Pruned reclaimable build-cache entries.
  - Preserved `overnightdesk-operations-audit:latest`; it is a required
    one-shot operational image and has a rebuild path at
    `~/overnightdesk-operations-audit` plus `/opt/overnightdesk/run-audit.sh`.
  - Remaining large image footprint is mostly active runtime images, especially
    Hermes and Camofox, so no broader prune was performed.

- [x] Reconcile dirty Aegis source checkouts.
  - Cleaned `~/overnightdesk-ops`, `~/overnightdesk-platform-standard`, and
    `~/overnightdesk-engine` on 2026-06-11.
  - Backups are on Aegis at
    `/home/ubuntu/git-clean-backups/20260611T144032Z/`, including tracked
    diffs, untracked tarballs, and a separate copy of `~/overnightdesk-engine/.env`.
  - Final state: all three checkouts are clean against `origin/main`.

- [x] Monitor Hermes Telegram timeout traces.
  - Health-check tail showed Telegram `TimedOut` exceptions for both tenants.
  - Follow-up log scan on 2026-06-11 found one recent Telegram
    `Bad Gateway`/`TimedOut` incident per tenant and zero matching
    timeout/error lines in the latest two-hour window.
  - Classified as transient upstream Telegram/network behavior; no runtime
    change made unless it recurs.

## P2 - Documentation and Workflow Cleanup

- [x] Decide the permanent deployment log location after moving active work off
  `/mnt/f`.
  - New canonical local audit trail:
    `/home/frosted639/src/overnightdesk-suite/deploys.log`.
  - Existing `/mnt/f/deploys.log` history was copied to the new WSL-native
    path on 2026-06-11.
  - Updated the Aegis skill and platform-standard deployment docs together.

- [x] Decide what to do with `overnightdesk-job-observatory`.
  - The WSL clone is local-only with no remote and only `PRD.md`.
  - Classified on 2026-06-11 as a parked planning stub, not an active
    operational repo.
  - Flight Recorder is not the same scope: it captures engine/runtime events
    and snapshots, while Job Observatory describes scheduled-job heartbeat,
    gap detection, and daily summary alerting.
  - Keep the stub for now; do not wire it into deploy or health-check workflows
    unless scheduled-job observability becomes an active feature.

- [x] Confirm whether archived `/mnt/f/_archive/overnightdesk*` checkouts should
  be retained long-term or deleted after a cooling-off period.
  - They contain the old untracked parent docs/context/spikes and any ignored
    local state intentionally left behind.
  - Retention decision on 2026-06-11: keep for a 30-day cooling-off period,
    then delete after one final confirmation if no missing state has surfaced.
  - Target review/delete date: 2026-07-11.
  - Current footprint is about 2.2 GB total, mostly
    `/mnt/f/_archive/overnightdesk` at about 1.9 GB.

## P3 - Optional Improvements

- [ ] Add a top-level `README.md` or `AGENTS.md` in
  `/home/frosted639/src/overnightdesk-suite/` describing the multi-repo layout.

- [ ] Add a small verification script for the suite.
  - Suggested checks: repo status, expected branches/remotes, `npm ci` and
    research tests for ops, targeted Go tests for audit and engine.

- [ ] Review `overnightdesk-ops` dependency audit findings.
  - `npm ci` reported 8 audit findings: 6 moderate, 2 high.
  - Do this separately from migration because `npm audit fix` may broaden the
    dependency changes.
