# Gate 0 Current Tailscale Inspection

**Captured**: `2026-09-02T17:45:42Z` through `2026-09-02T18:10:09Z`

**Task**: T060

**Result**: complete for the simplified pilot boundary; current endpoint
evidence proves tailnet-wide reachability, which the owner accepted as a
bounded residual risk on 2026-09-02.

## Node and route baseline

| Fact | Current value |
| --- | --- |
| Client | Tailscale 1.102.2, backend `Running` |
| Node | `aegis-prod.tail5c4f73.ts.net.` / `ndSx179pnb11CNTRL` |
| Addresses | `100.100.1.21/32`, `fd7a:115c:a1e0::8538:115/128` |
| Advertised routes | none (`AdvertiseRoutes: null`) |
| Approved/primary routes | none |
| Accept routes | false |
| Exit-node role | false |
| Node tags | none |
| Tailnet Lock | not enabled |

The host route tables contain only peer Tailscale addresses and the Tailscale
IPv6 ULA route. No OCI private subnet or candidate `/32` is advertised or
injected. No Tailscale setting was changed.

## Visible device inventory

The local control-plane view exposes five devices, all owned by the same
Tailscale user and none carrying a tag:

| Device | Tailscale IPv4 | Current state | Key expiry |
| --- | --- | --- | --- |
| `powerbox2-OptiPlex-7060` | `100.83.35.102` | online | local node |
| `aegis-prod` | `100.100.1.21` | online | `2026-09-22T11:15:40Z` |
| `PowerStation` | `100.109.100.74` | online | `2027-02-24T22:39:06Z` |
| `GamingDesktop` | `100.76.180.111` | offline | `2027-02-11T18:43:50Z` |
| `powerbox` | `100.91.212.100` | offline | `2027-02-22T19:06:10Z` |

Because all five devices share the same owner identity and are owner-controlled,
the simplified pilot accepts their transport reachability. No device selector,
tag, or policy change is required. A future non-owner device or user joining
the tailnet reopens this decision before it may reach Buzz.

## Existing Serve root

The existing tailnet-only Serve configuration remains:

```text
https://aegis-prod.tail5c4f73.ts.net
└── / -> http://100.100.1.21:13005
```

The local target responds with HTTP 401 to an unauthenticated probe, showing
that `ob1-mcp` is present without disclosing content. The canonical Serve JSON
SHA-256 is
`a0a43a1e03ff524a13695db5b081ea20ba68ef370337f5bf0d4c80ed8cde0b24`.
No Buzz Serve handler, service, route, or Tailscale identity exists.

## Access-policy finding

The endpoint's compiled packet filter contains one rule whose sources cover
the complete tailnet IPv4 CGNAT ranges and Tailscale IPv6 ULA, whose
destinations are all IPv4 and IPv6 addresses on ports 0-65535, and whose
protocols include TCP, UDP, ICMP, and ICMPv6. Its canonical SHA-256 is
`9745cabba9af87790e64ba351294135b2fccf3ac32b34fb18ff4dbc168748a0b`.

This is endpoint evidence of the default broad allow posture, not an
authoritative copy of the human-readable policy. Tailscale documents that its
default policy allows all tailnet devices to communicate and that grants are
additive: a more-specific grant does not override a less-specific grant; their
capabilities are unioned.

Sources:

- <https://tailscale.com/docs/reference/examples/acls>
- <https://tailscale.com/docs/reference/syntax/grants>

Consequently, adding a narrow Buzz grant would not make the `/32` owner-device
only while the broad rule remains. The owner therefore chose not to add that
ineffective second control. Gate 2 may test the exact `/32` under the unchanged
policy, while Buzz NIP-42/NIP-98 membership remains the participant boundary.

## DNS and policy visibility

MagicDNS is enabled for `tail5c4f73.ts.net`. No general resolver is configured
by the tailnet; the only split routes are the existing Tailscale domains. There
is no current private resolver rule for `buzz.overnightdesk.com`.

The local client can expose its compiled packet filter and visible peer
inventory but not the canonical tailnet policy, policy tests, auto-approvers,
groups, device posture, or grant source selectors. No Tailscale API/OAuth
credential is present on the inspected hosts or in the Buzz repository.

The canonical policy export is no longer a Gate 0 dependency because this
pilot does not propose a tailnet-policy mutation. The compiled filter digest,
visible device inventory, route baseline, and Serve baseline are sufficient to
prove the accepted current state and detect unexpected change. Route approval
remains a separate, explicit production action. Changing policy, ownership, or
tags remains out of scope and separately approval-bound.

## Baseline digests

| Surface | SHA-256 |
| --- | --- |
| Serve JSON | `a0a43a1e03ff524a13695db5b081ea20ba68ef370337f5bf0d4c80ed8cde0b24` |
| preferences excluding identity configuration | `b45cf0fcb74cd582ab4847170bada6f4d850c5392b06a7526282609b98d03c31` |
| compiled packet filter | `9745cabba9af87790e64ba351294135b2fccf3ac32b34fb18ff4dbc168748a0b` |

## Decision

T060 is complete for the simplified design. The evidence proves that every
current owner-controlled tailnet device will be able to reach an approved Buzz
`/32`; that fact is accepted rather than hidden. It grants no Buzz subscription,
read, or write permission. The owner and each named Hermes agent still require
separate Nostr identities and closed-relay membership.
