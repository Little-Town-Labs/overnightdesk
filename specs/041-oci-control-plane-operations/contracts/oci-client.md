# OCI Client Contract

The implementation must isolate OCI transport behind interfaces that can be
replaced by fixture fakes.

## Required Operations

- list boot-volume backups for the configured compartment and page token;
- list host-vulnerability summaries for the configured compartment and page
  token;
- get detailed vulnerability data for each approved host-vulnerability ID;
- expose response status, sanitized response headers, OCI request ID, and
  continuation token separately from decoded records.

## Safety Rules

- every request uses the configured region and compartment scope;
- request timeouts and page/item ceilings are enforced centrally;
- only read-only transient failures are eligible for bounded retry;
- malformed response shapes fail validation and become explicit unresolved
  evidence, never patch-selection input;
- request IDs are retained for correlation but authorization headers and signed
  material are never returned to callers or logs.

## Future Write Boundary

The write client is a separate interface and package. It is not constructed by
MVP commands. Any future implementation must require a distinct write identity,
exact target allowlist, approval record, current backup evidence, and explicit
work-request handling.
