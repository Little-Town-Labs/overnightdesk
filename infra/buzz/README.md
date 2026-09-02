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
`/32` under the unchanged tailnet-wide policy. The shared Nginx container gets
no new Docker publication and is not recreated: hardened systemd raw-TCP
forwarding connects private host `:443` to Nginx's fixed `buzz-ingress:8443`
endpoint. The same canonical TLS virtual host is available to intake workers
only at Nginx's fixed `buzz-agents:443` endpoint. Intake workers remain off the
shared production network and reach only fixed named Hermes operations through
an Nginx egress broker with anchored run IDs and no query or approval-response
paths. Buzz membership separately admits the owner and distinct Walter, Titus,
and Mitchel/Trevor identities; one agent qualifies first as the canary. Tasks
begin at T055 in `specs/042-buzz-private-pilot/tasks.md`.
