# Contract: Backup and Restore

## Recovery Set

The encrypted set contains a transaction-consistent PostgreSQL dump, MinIO
object snapshot, Redis diagnostic/AOF state, and safe configuration manifest.
Local Git data is disposable scratch in the assessed source and is recreated,
not archived as authoritative state. Identity and service secrets remain in
approved encrypted secret custody and are referenced only by opaque metadata.
Tailscale node state is excluded from the multi-store recovery set: loss or
corruption is recovered by revoking the old device and explicitly re-enrolling
a new `buzz` device after approval, preventing accidental identity duplication.

All authoritative artifacts share one maintenance-window and release marker.
The producer writes `COMPLETE` only after encryption, integrity metadata, and
off-box set completion succeed.

## Restore

Restore uses disposable names and an isolated unrouted network. It restores
database, object, and coordination state in documented order, creates empty
Git scratch, starts the exact candidate, and validates membership, channels,
messages, attachments, logical repository rehydration, schema/migration state,
and secret absence from evidence.

## Gate

Owner admission requires a successful restore of the current release and
schema. A missing artifact, incompatible point, failed assertion, excessive
duration, or incomplete marker blocks ingress/admission and preserves evidence.
