# Buzz pilot artifacts

Planning and Issue #249 were reactivated on 2026-09-02 using the private
Nginx-listener design in `specs/042-buzz-private-pilot/`. This directory is not
yet authorized for build, publication, deployment, or production-secret use.

The existing relay Dockerfile and candidate-image test are historical outputs
from the 2026-09-01 sidecar research. They remain unchanged for reproducibility
and are not current production candidates until Gate 0 requalifies their exact
source, base packages, ARM64 digest, SBOM, scan, non-root behavior, and startup.

Future implementation must follow ADR-008: no Tailscale container, no public
Buzz listener, no OvernightDesk `auth_request`, exact
`wss://buzz.overnightdesk.com` WebSocket plus
byte-exact full NIP-98 HTTPS request URL contracts under
`https://buzz.overnightdesk.com`, three least-connectivity networks, and an
explicitly assigned secondary private address with an exact host-advertised
`/32` plus separate owner-device grant. Tasks begin at T055 in
`specs/042-buzz-private-pilot/tasks.md`.
