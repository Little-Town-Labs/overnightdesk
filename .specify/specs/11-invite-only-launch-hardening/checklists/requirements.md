# Requirements Checklist — Feature 11: Invite-Only Launch Hardening

## Middleware & Routing
- [ ] /api/stripe/webhook reachable without session (returns 400 bad signature, not 302)
- [ ] /api/cron/health-check reachable without session (returns 401 unauthorized, not 302)
- [ ] /api/cron/usage-collection reachable without session
- [ ] /api/provisioner/callback reachable without session
- [ ] /api/email/unsubscribe reachable without session
- [ ] /api/stripe/checkout still requires session (not made public)
- [ ] /api/stripe/portal still requires session
- [ ] /api/engine/* still requires session

## Security
- [ ] Provisioner callback uses crypto.timingSafeEqual
- [ ] unsubscribe.ts throws on missing BETTER_AUTH_SECRET
- [ ] db/index.ts throws on missing DATABASE_URL
- [ ] Security headers present on all responses (X-Frame-Options, HSTS, nosniff, Referrer-Policy, Permissions-Policy)

## Invite-Only Registration
- [ ] INVITED_EMAILS env var parsed (comma-separated, case-insensitive)
- [ ] Invited email can register successfully
- [ ] Non-invited email rejected server-side with clear message
- [ ] Admin email can register (even if not in INVITED_EMAILS)
- [ ] Sign-up page shows invite-only messaging

## Landing Page
- [ ] Step 2 describes Claude Code subscription (not OpenRouter)
- [ ] Privacy section accurate for BYOS model
- [ ] Nav has "Sign in" text link
- [ ] Waitlist remains primary CTA

## Engine-Client Data Shapes
- [ ] getJobs() returns array, not envelope object
- [ ] getConversations() returns array, not envelope object
- [ ] getConversationMessages() returns array (verify and fix if needed)
- [ ] getEngineLogs() returns array (verify and fix if needed)
- [ ] Usage collection reports non-zero for instances with activity

## Tests
- [ ] middleware-utils tests cover all new public routes
- [ ] isInvitedEmail() unit tests (match, no match, case insensitive, empty env)
- [ ] Sign-up invite gate integration test
- [ ] Engine-client response unwrapping tests
- [ ] Provisioner callback timing-safe auth test
- [ ] All existing tests still pass (485+)
- [ ] 80%+ coverage on changed files
