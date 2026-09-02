# Contract: Named Hermes Identities and Authority

- Walter, Titus, and Mitchel/Trevor each use a newly generated Nostr identity
  distinct from the owner, relay administrator, other agents, and negative-test
  identities. Keys are never shared.
- Each identity has read/write Buzz membership in exactly one pilot channel.
  One owner public key is the only automated-response trigger; bot-authored
  messages may be read as context but cannot trigger another bot.
- One selected Hermes agent is admitted and qualified as the canary before the
  remaining two are admitted one at a time.
- Each intake worker has one concurrent job, bounded input/output/time, and an
  explicit deduplication window. It cannot approve a Hermes action or alter the
  runtime's existing tool, model, memory, or human-approval policy.
- Every accepted message has a valid signature from the exact owner public key
  and the exact pilot channel before submission to the authenticated Hermes
  `/v1/runs` route. Each worker fails closed when its frozen runtime URL,
  runtime identity, or credential is missing or does not match its named-agent
  mapping.
- Each worker's Buzz path is `buzz-agents` to canonical Nginx at the exact
  WebSocket relay URL `wss://buzz.overnightdesk.com` and, when a qualified
  operation requires NIP-98, the frozen full request URL under
  `https://buzz.overnightdesk.com`.
- No worker can resolve or connect directly to the relay, PostgreSQL, Redis,
  MinIO, host Docker socket, metadata endpoints, the shared production network,
  or another production service. Its only Hermes path is the fixed-target Nginx
  egress broker on `buzz-agents`; it has no credential for another runtime.
- A successful run may publish one bounded response only to the same pilot
  channel that supplied the accepted owner event. The worker never treats its
  own response or another bot-authored event as a new trigger.
- A Buzz-originated request receives only the mapped Hermes runtime's existing
  authority. Deployment, shell, repository, secret, payment, outreach,
  CRM/customer/prospect-data, production-lifecycle, and other high-impact
  actions continue to require their current explicit human approval. The
  intake worker cannot satisfy, synthesize, or bypass an approval response.
- Intake state is limited to correlation, lease, retry, and deduplication data;
  it does not persist raw Buzz messages or Hermes responses outside Buzz and
  the runtime's already-approved memory boundary.
- Missing or malformed owner, agent-identity, channel, or trigger policy fails
  closed.
- Revocation stops admission, discards queued events not yet submitted to
  Hermes, prevents future submissions, and suppresses publication of a late
  result from a previously submitted run for only the selected agent. The
  current Hermes API cannot cancel an already-submitted run; it may complete
  under the runtime's unchanged tool and human-approval policy. The owner and
  other named agents remain unaffected.
- Logs and evidence record only safe correlation IDs, durations, result/denial
  classes, and resource measurements—never prompts, responses, keys, signed
  events, headers, or message bodies.

Qualification runs separately for all three identities and includes valid
owner interactions, bot-trigger denial, unapproved caller/channel, duplicate,
adversarial, restart, capacity, direct-network, queued-event revocation, and
late-result suppression cases.
