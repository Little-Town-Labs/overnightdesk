# Gate 0 Current OCI, DNS, and Certificate Inspection

**Captured**: `2026-09-02T17:45:42Z` through `2026-09-02T18:59:45Z`

**Task**: T059

**Result**: complete for control-plane inspection and candidate selection; this
is not approval to assign a secondary private IP.

## Access restoration and mutation boundary

The configured OCI user-key profile initially returned `401 NotAuthenticated`.
The configured fingerprint did not match the fingerprint derived locally from
the existing private key. With explicit owner approval, the existing config was
backed up to
`/home/ubuntu/.oci/config.pre-buzz-gate0-20260902T1806Z` and only its
`fingerprint=` value was corrected. File ownership and mode `0600` were
preserved. The repaired profile authenticated successfully.

No private key, cloud IAM policy, dynamic group, VNIC, private/public address,
route, gateway, security rule, DNS record, certificate, or workload was
created, changed, or removed. Evidence excludes credential content and OCI
request signatures.

## VNIC and address inventory

| Fact | Current value |
| --- | --- |
| Instance | `aegis-prod` in `us-chicago-1` |
| Shape | `VM.Standard.A1.Flex`, 4 OCPUs, 24 GB RAM |
| VNIC | `ocid1.vnic.oc1.us-chicago-1.abxxeljszx3nyeh647nt5eqnwlbl4q5xevseif7hbac5nkdihfsnyjfv5gcq` |
| Attachment | attached; primary VNIC; NIC index 0; VLAN tag 2222 |
| Hostname/MAC | `aegis-prod`; `02:00:17:01:8A:7A` |
| Primary private IP | `10.0.0.234`, ephemeral private-IP object |
| Current public IP | `147.224.183.55`, associated with the primary private IP |
| Secondary private IPs | none |
| VNIC network security groups | none |
| Skip source/destination check | false |
| OCI IPv6 addresses | none |

The subnet-wide private-IP inventory contains only `10.0.0.234`. This proves
that no secondary private IP is currently allocated in the subnet, but it does
not select or reserve a candidate.

A later exact read-only query for `10.0.0.233` returned no private-IP object.
The address is within OCI's usable `.2` through `.254` range for this `/24`;
the host has no `.233` address or listener, and no Tailscale node advertises
`10.0.0.233/32`. T061 therefore records `.233` as the unreserved candidate.
No assignment or reservation occurred, and the query must be repeated
immediately before any approved assignment.

Oracle documents that a secondary private IP must be from the VNIC subnet and
that its OS address must be configured separately after the OCI assignment.
Oracle also documents that direct internet communication requires both a
public subnet and an associated public-IP object. Ephemeral public IPs can be
assigned only to primary private IPs, while a reserved public IP can be
associated with a secondary private IP. Therefore assignment-time evidence
must prove that no reserved public-IP object is associated with the future
Buzz address.

Sources:

- <https://docs.oracle.com/en-us/iaas/Content/Network/Tasks/private-ip-create.htm>
- <https://docs.oracle.com/en-us/iaas/Content/Network/Tasks/managingIPaddresses_topic-Linux_Details_about_Secondary_IP_Addresses.htm>
- <https://docs.oracle.com/en-us/iaas/Content/Network/Tasks/managingpublicIPs.htm>
- <https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/overview.htm>

## Subnet, routes, and gateways

| Fact | Current value |
| --- | --- |
| Subnet | `subnet-aegis-prod`, `10.0.0.0/24`, state `AVAILABLE` |
| Virtual router | `10.0.0.1` |
| Public-IP prohibition | false |
| Internet-ingress prohibition | false |
| Route table | one static `0.0.0.0/0` route to the VCN Internet Gateway |
| Internet Gateway | one enabled gateway, `Internet Gateway aegis-prod` |
| NAT gateways | none |
| Service gateways | none |
| Local peering gateways | none |
| DRG attachments | none |

This is a public subnet. Its routing does not make an unassociated secondary
private-IP object publicly addressable by itself, but the subnet permits a
reserved public IP to be attached later. The frozen Buzz invariant therefore
requires both a negative public-IP association check and a listener-binding
check during any separately approved address-assignment experiment.

## Security lists and IPv6

The VNIC has no NSGs. Its subnet security list is stateful and currently
permits:

- all egress to `0.0.0.0/0`; and
- inbound TCP 22, 80, and 443 from `0.0.0.0/0`.

No IPv6 prefix, OCI IPv6 address, IPv6 route, or IPv6 ingress rule was found.
Because TCP 443 is internet-permitted at the security-list layer, public
isolation must come from the absence of a public-IP association and from
binding Nginx only to the future private address. Existing public ingress on
`10.0.0.234` / `147.224.183.55` remains unchanged.

## Public DNS and reachability observation

The authoritative nameservers are Namecheap's
`dns1.registrar-servers.com` and `dns2.registrar-servers.com`.

At capture time:

- `buzz.overnightdesk.com` returned public A `147.224.183.55` and no AAAA;
- the intentionally nonexistent
  `gate0-nonexistent-20260902.overnightdesk.com` returned the same public A;
- both names, forced to the public address with their own SNI/Host values,
  reached Nginx's existing default HTTP 302 sign-in redirect; and
- the certificate selected for the unknown SNI was the existing
  `aero-fett.overnightdesk.com` certificate, not a Buzz certificate.

This strongly indicates wildcard A synthesis rather than a proven explicit
Buzz record. The simplified design therefore treats public DNS as untrusted:
private resolution must select the private address, while the public listener
must remain unable to select Buzz even with this wildcard answer.

An exact non-address owner name that suppresses wildcard A synthesis, plus a
private resolver path for the selected address, must be designed and tested
before Gate 0 can pass. DNS changes require separate approval.

## DNS-01 constraint

Aegis currently renews eleven Let's Encrypt lineages using HTTP `webroot`.
There is no Buzz lineage and no installed DNS provider plugin or approved
DNS-01 credential/renewal path. Gate 0 must freeze and qualify a DNS-01 method,
least-privilege secret custody, renewal unit, failure alert, and non-public
resolution behavior before T062 can complete.

## Decision

T059 is complete as a read-only inspection. It establishes the exact OCI
topology and the controls that an address experiment must prove, but does not
authorize or complete that experiment. T060 now records the accepted
tailnet-wide transport posture. Candidate selection may proceed as a
documentation-only step; any OCI address assignment, host address
configuration, route advertisement, DNS change, certificate issuance, or
listener change still requires separate approval.
