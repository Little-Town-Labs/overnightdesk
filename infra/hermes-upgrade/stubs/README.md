# Hermes Local Stub Boundaries

The local harness uses deterministic boundary names instead of real provider
URLs. The runtime-mode network will contain only these services and the
candidate containers. Every service has delivery disabled and returns fixture
data suitable for contract checks.

No stub may accept a production token, forward a request, or silently proxy to
the internet. A missing or malformed stub is a failed qualification gate.

`server.py` exposes only `GET /health` and `POST /v1/operation`. Allowlisted
read/preflight operations return deterministic fixtures. Operations ending in
`.send`, `.mutate`, or `.deploy` return a safe refusal with
`delivery_attempted=false`; no request is forwarded. `Dockerfile` runs this
server as an unprivileged user in the internal Compose network.
