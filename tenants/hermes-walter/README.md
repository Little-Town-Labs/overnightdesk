# Hermes Walter

Repo-owned identity source for the Aegis platform-operations runtime.

- Runtime/container after cutover: `hermes-walter`
- Default persona: Walter
- Use case: operate, inspect, and help oversee OvernightDesk on Aegis
- Authorized operator: Gary
- Primary memory: existing `hermes-agent-data` volume, intentionally retained
- Shared knowledge: explicit Open Brain access; shared knowledge does not merge
  Walter's runtime-local history with Rex, Titus, or Mitchel

The runtime can also host bounded profiles such as Guardian and Librarian. Those
profiles do not create separate runtimes or primary memory stores.

`hermes-agent` remains only as the reversible migration identity and as the
upstream product/image name where applicable.
