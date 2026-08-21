# Secret Provider Contract

The runtime configuration contains a reference to a dedicated Phase
app/environment/path and secret name, never a private-key value. The approved
host launcher invokes the pinned Phase CLI with explicit `--app` and `--env`
arguments and passes only the named PEM secret to the one-shot process.

## Provider Behavior

- read the Phase-injected PEM value from the process environment only while
  constructing the official OCI SDK raw configuration provider;
- inject the private key directly into process memory or a documented SDK
  signer object without creating a temporary key file;
- clear provider-owned buffers on terminal completion where the Go runtime
  permits;
- return safe error categories for missing, malformed, or inaccessible secrets.

## Forbidden Behavior

- no private key or Phase token in Git, config JSON, evidence, logs, command
  output, crash diagnostics, or test snapshots;
- no secret values in general environment dumps;
- no `phase secrets export`, `eval`, `.env`, or durable host file containing the
  OCI private key;
- no fallback to `oci-keyfile`, arbitrary filesystem paths, or developer-home
  files;
- no Phase app/environment/path discovery from untrusted input.

The exact Phase CLI invocation and host file permissions are recorded in
`research.md` and the companion deployment runbook before implementation.
