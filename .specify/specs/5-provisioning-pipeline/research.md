# Technology Research — Feature 5: Provisioning Pipeline

## Decision 1: Provisioner Service on Oracle Cloud

**Options Considered:**
1. **Adapt ironclaw-saas provisioner (Node.js + bash scripts)** — Proven, handles Docker socket, async provisioning
2. **Go provisioner service** — Type-safe, matches engine language
3. **Python Flask/FastAPI provisioner** — Quick to build, good for scripting

**Chosen:** Adapt ironclaw-saas provisioner (Node.js + bash scripts)
**Rationale:** The ironclaw-saas provisioner is battle-tested, handles all the edge cases (async provisioning, health checks, graceful shutdown), and the bash scripts (lib.sh, container-defaults.sh) are directly reusable. Rewriting in Go/Python would duplicate working code for no benefit.
**Tradeoffs:** Node.js on the Oracle VM is an additional runtime. Acceptable — it's already installed for the ironclaw-saas provisioner.

## Decision 2: Vercel → Oracle Cloud Communication

**Options Considered:**
1. **Direct HTTPS POST with shared secret** — Simple, secure
2. **Stripe webhook forwarding** — Oracle Cloud receives Stripe webhooks directly
3. **Polling** — Oracle Cloud polls Vercel for pending provisioning jobs

**Chosen:** Direct HTTPS POST with shared secret
**Rationale:** Vercel owns the subscription lifecycle. The webhook handler already runs on Vercel (Feature 4). Adding a provisioning step to the existing webhook is simpler than forwarding Stripe events to Oracle Cloud. The provisioner on Oracle Cloud exposes a simple API: `POST /provision` and `POST /deprovision`.
**Tradeoffs:** Requires the Oracle Cloud server to be accessible from Vercel via HTTPS. This is already the case (nginx serves TLS on the public IP).

## Decision 3: Provisioning Trigger Point

**Options Considered:**
1. **Extend handleCheckoutCompleted()** — Add provisioning call after subscription creation
2. **Separate webhook listener** — New event type for provisioning
3. **Polling from dashboard** — User clicks "Provision" manually

**Chosen:** Extend handleCheckoutCompleted()
**Rationale:** The checkout completion webhook already creates the subscription record. Adding the instance record creation and provisioning API call here keeps the flow atomic. The provisioning API call is fire-and-forget from Vercel's perspective — the Oracle provisioner handles the async work.
**Tradeoffs:** Makes handleCheckoutCompleted() do more work. Acceptable — it's still a single async function with clear steps.

## Decision 4: Tenant ID Generation

**Options Considered:**
1. **Email slug** (e.g., `gary-at-example-com`) — Human-readable but leaks email structure
2. **User ID prefix** (e.g., first 12 chars of UUID) — Unique, opaque
3. **Custom slug** (user chooses) — Adds UI complexity

**Chosen:** User ID prefix (first 12 chars of UUID)
**Rationale:** Guaranteed unique (UUIDs are unique), URL-safe, doesn't leak the user's email, no collision risk. The ironclaw-saas pattern of slugifying email is unnecessary since we have proper user IDs.
**Tradeoffs:** Not human-readable. Acceptable — tenants rarely see their tenant ID directly.

## Decision 5: Bearer Token Generation & Storage

**Options Considered:**
1. **openssl rand -base64 32 on Oracle Cloud** — Match ironclaw-saas pattern, generated during provisioning
2. **crypto.randomBytes(32) on Vercel** — Generated before provisioning, stored hashed in Neon
3. **UUID v4** — Less entropy than random bytes

**Chosen:** crypto.randomBytes(32) on Vercel
**Rationale:** The token hash needs to be in the platform database (Neon) for future API auth checks. Generating on Vercel means we can store the hash immediately and send the plaintext in the welcome email. The Oracle provisioner receives the token hash to configure the container.
**Tradeoffs:** Plaintext token exists briefly in Vercel's memory. Acceptable — same trust boundary as Stripe secrets.

## Decision 6: Container Image

**Options Considered:**
1. **Pre-built overnightdesk-engine image on Docker Hub/GHCR** — Standard container registry
2. **Build on Oracle Cloud from source** — No registry needed but slow
3. **Local image on Oracle Cloud** — Built once, pulled from local

**Chosen:** Pre-built image from GitHub Container Registry (GHCR)
**Rationale:** The engine repo already has a Dockerfile. Publishing to GHCR is standard for the GitHub ecosystem. The Oracle provisioner `docker pull` before each provisioning to get the latest image.
**Tradeoffs:** Requires GHCR authentication on Oracle Cloud. Minor setup.

## Decision 7: Port Allocation

**Options Considered:**
1. **Database sequence** (ironclaw-saas pattern) — `next_tenant_port()` SQL function
2. **Query max port + 1** — Simple but race-condition prone
3. **Random port in range** — Could collide

**Chosen:** Query existing ports, find next available in range 4000-4999
**Rationale:** The platform database already has the `gateway_port` column on the instance table. Query all allocated ports, find the first unused one in the range. No need for a separate SQL sequence (simpler than ironclaw-saas, which used Postgres-specific sequence functions).
**Tradeoffs:** Slightly less efficient than a sequence. Acceptable at 40-tenant scale.

## Decision 8: Nginx on Oracle Cloud

**Options Considered:**
1. **Reuse ironclaw-saas nginx config pattern** — write_nginx_conf() generates per-tenant server blocks
2. **Traefik** — Auto-discovery, no config file management
3. **Caddy** — Automatic TLS, simpler config

**Chosen:** Reuse ironclaw-saas nginx pattern
**Rationale:** The nginx config generation in lib.sh is proven and matches the constitution's architecture. Per-tenant server blocks with wildcard TLS, WebSocket support, and security headers. The write_nginx_conf() function is directly reusable.
**Tradeoffs:** Manual cert management (certbot). Already handled on the Oracle VM.
