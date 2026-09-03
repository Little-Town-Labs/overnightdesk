# Buzz pilot artifacts

Planning and Issue #249 were reactivated on 2026-09-02 using the private
Nginx-listener design in `specs/042-buzz-private-pilot/`. Local Gate 0 image
qualification is authorized. Image publication, deployment, production-secret
use, and other production mutation are not.

The relay Dockerfile and candidate-image test began as historical outputs from
the 2026-09-01 sidecar research. T057 refreshed them to the exact current Buzz
ARM64 input and repeated reproducibility, binary-identity, SBOM, scan,
non-root, read-only-root, and startup checks. The resulting image remains a
local candidate only; see `specs/042-buzz-private-pilot/evidence/current-images.md`.
T057 also added a minimal PostgreSQL 17.11 wrapper that preserves the exact
Docker Official ARM64 artifact, replaces only its known-fixed OpenSSL packages,
and makes the proven UID/GID `70:70` runtime explicit. It is likewise local
only and should be removed if a clean refreshed official digest is available
before publication.

The historical MinIO and `mc` images are rejected.
[ADR-009](../../docs/decisions/009-buzz-object-store-qualification.md) requires one
maintained S3-compatible store to pass both the immutable ARM64 image gate and
Buzz's exact operation contract; generic S3 claims and disabling the Git probe
are insufficient. Garage v2.3.0 is rejected because it lacks required
conditional-write and object-version behavior. RustFS is the next provisional
candidate for T057 prequalification, not an approved backend. See the
[object-store contract](../../specs/042-buzz-private-pilot/contracts/object-store.md),
[Garage prequalification](../../specs/042-buzz-private-pilot/evidence/garage-prequalification.md),
and [upstream issue review](../../specs/042-buzz-private-pilot/evidence/buzz-s3-open-issues.md).

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
