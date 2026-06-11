# OvernightDesk Post-Migration Follow-ups

Created: 2026-06-11

## P0 - Time-Sensitive Operations

- [ ] Fix or confirm TLS renewal for `aegis-prod.overnightdesk.com`.
  - Health check showed the served certificate expires on 2026-06-19.
  - Host `certbot.timer` exits successfully, but `sudo certbot certificates`
    reports no host-managed certs while nginx uses certs under
    `/opt/overnightdesk/certbot/conf`.
  - Determine whether renewal should run through the Docker certbot volume path
    or host certbot, then test renewal and nginx reload.

## P1 - Production Hygiene

- [ ] Decide whether to prune Docker images on `aegis-prod`.
  - `docker system df` showed about 13.3 GB reclaimable images.
  - Before pruning, confirm no one-shot operational image such as
    `overnightdesk-operations-audit:latest` would be lost without a rebuild path.

- [x] Reconcile dirty Aegis source checkouts.
  - Cleaned `~/overnightdesk-ops`, `~/overnightdesk-platform-standard`, and
    `~/overnightdesk-engine` on 2026-06-11.
  - Backups are on Aegis at
    `/home/ubuntu/git-clean-backups/20260611T144032Z/`, including tracked
    diffs, untracked tarballs, and a separate copy of `~/overnightdesk-engine/.env`.
  - Final state: all three checkouts are clean against `origin/main`.

- [ ] Monitor Hermes Telegram timeout traces.
  - Health-check tail showed Telegram `TimedOut` exceptions for both tenants.
  - A follow-up 30-minute log scan found no repeated timeout/error lines, so
    this looks transient unless it recurs.

## P2 - Documentation and Workflow Cleanup

- [ ] Decide the permanent deployment log location after moving active work off
  `/mnt/f`.
  - Current Aegis skill still says production deployments append to
    `/mnt/f/deploys.log`.
  - If the new standard should be WSL-native or cloud-backed, update the skill
    and platform-standard docs together.

- [ ] Decide what to do with `overnightdesk-job-observatory`.
  - The WSL clone is local-only with no remote and only `PRD.md`.
  - It appears to be a planning stub; Flight Recorder may have absorbed the
    useful functionality.

- [ ] Confirm whether archived `/mnt/f/_archive/overnightdesk*` checkouts should
  be retained long-term or deleted after a cooling-off period.
  - They contain the old untracked parent docs/context/spikes and any ignored
    local state intentionally left behind.

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
