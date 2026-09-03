# Contract: Backup and Restore

## Authoritative set

- PostgreSQL and the selected object store are captured in one maintenance
  window with a shared marker and immutable release/schema metadata.
- Redis is diagnostic/cache state and is not required for authoritative
  recovery. Git scratch is regenerated and validated.
- A `COMPLETE` marker is written only after both authoritative encrypted
  artifacts, digests, sizes, and off-box transfer succeed.
- Secrets, private keys, authorization material, and message content never
  enter evidence or backup metadata.

## Restore gate

- Restore occurs on a disposable, unrouted network with distinct names and no
  production listener.
- PostgreSQL is restored before relay validation; the object store is restored
  before media, Git, version-deletion, and object-reference assertions.
- Logical checks cover schema/migrations, community/membership references,
  object references, synthetic pilot records, and restart behavior.
- The restored object store repeats the required operations in
  [object-store.md](object-store.md); a passing startup probe alone is
  insufficient recovery evidence.
- RPO and RTO are measured. Owner admission is blocked until the exact current
  candidate has a successful restore run.

## Ingress recovery

There is no Buzz Tailscale node state to back up. Non-secret OCI VNIC/host-
interface assignment, systemd socket/proxy, fixed Nginx bridge listeners,
egress-broker, route, policy-digest, certificate-reference, and config-digest
metadata may be recorded, but the secondary private address, private socket,
and exact `/32` route are recreated only through the normal approval-bound
activation sequence. Recovery never clones or restores the host Tailscale
identity.
