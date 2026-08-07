# Qualification Profile Contract

Each profile is stored at
`tenants/hermes-<agent>/qualification/profile.yaml` and has the same shape.

```yaml
schema_version: 1
agent: walter
source: tenants/hermes-walter
state:
  mode: synthetic
required_paths:
  - README.md
required_stubs:
  - inference
  - health
allowed_operations:
  - health.read
denied_operations:
  - github.mutate
  - production.deploy
production_markers:
  - /run/phase
  - aegis-prod
```

The runner verifies that the source path exists, every required path exists,
every stub is declared, state mode is synthetic, and production markers do not
appear in local runtime inputs. Profile-specific tests may invoke the existing
tenant qualification scripts, but the common runner must still emit one result
per profile.
