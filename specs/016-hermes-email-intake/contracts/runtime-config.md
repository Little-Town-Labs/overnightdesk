# Contract: Per-Instance Runtime Configuration

Each instance receives one strict JSON object from a root-materialized,
read-only Phase export. Unknown and empty keys fail startup.

Required categories:

- identity: `EMAIL_ROUTE_ID`, `HERMES_TARGET_AGENT`;
- AgentMail: API key, inbox ID, inbox address, exact allowed sender set;
- database: least-privilege connection URL;
- Hermes: private base URL and API key;
- operation: enabled flag, interval, message/claim limits, request/run timeouts.

Configuration invariants:

- route ID is one of the three installed unit instances;
- inbox address normalizes exactly;
- sender set is non-empty and contains only exact mailbox addresses;
- base URL host is the configured private Hermes container name and uses the
  fixed API port;
- limits remain within compile-time safety bounds;
- disabled is the default and performs no external operation;
- no credential appears in Docker environment inspection or logs.
