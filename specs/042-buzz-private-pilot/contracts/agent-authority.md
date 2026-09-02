# Contract: Canary Identity and Authority

- The canary uses a newly generated identity distinct from the owner, relay
  administrator, existing agents, and negative-test identities.
- It accepts requests from exactly one owner public key in exactly one channel.
- It has zero tools, one concurrent job, bounded input/output/time, and an
  explicit deduplication window.
- Its only network path is `buzz-canary` to canonical Nginx at the exact
  WebSocket relay URL `wss://buzz.overnightdesk.com` and, when a qualified
  operation requires NIP-98, the frozen full request URL under
  `https://buzz.overnightdesk.com`; it cannot resolve or connect directly to
  the relay, PostgreSQL, Redis, MinIO, host Docker socket, metadata endpoints,
  or other workload networks.
- It has no deployment, shell, repository, secret, payment, outreach,
  CRM/customer/prospect-data, production-lifecycle, or cross-channel authority.
- Missing or malformed caller/channel policy fails closed.
- Revocation stops admission, cancels queued work, terminates in-flight work at
  the approved boundary, and prevents future responses until a new approval.
- Logs and evidence record only safe correlation IDs, durations, result/denial
  classes, and resource measurements—never prompts, responses, keys, signed
  events, headers, or message bodies.

Qualification includes valid owner interactions, unapproved caller/channel,
duplicate, adversarial, restart, capacity, direct-network, and queued/in-flight
revocation cases.
