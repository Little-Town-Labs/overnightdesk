# Data Model — Feature 2: User Authentication

## Schema Status: Already Implemented

The database schema for user authentication was fully implemented in **Feature 1: Platform Database Schema**. No new tables or migrations are required for Feature 2.

## Tables Used by Auth

| Table | Purpose | Created In |
|-------|---------|-----------|
| `user` | User accounts (email, name, verification status) | Feature 1 |
| `session` | Active sessions (token, expiry, IP, user agent) | Feature 1 |
| `account` | Auth providers + password hash (provider "credential") | Feature 1 |
| `verification` | Email verification and password reset tokens | Feature 1 |
| `waitlist` | Pre-existing waitlist entries for conversion | Original schema |

## Key Schema Details

### Password Storage
Passwords are stored on the `account` table, not `user`. Better Auth creates an `account` row with `providerId = "credential"` and stores the bcrypt hash in the `password` column.

### Email Uniqueness
The `user` table has a unique constraint on `email`. Registration attempts with duplicate emails will fail at the database level.

### Session Lifecycle
- `session.token` is unique — used as the cookie value
- `session.expiresAt` controls session expiry
- `session.userId` FK cascades on delete — deleting a user removes all sessions

### Verification Tokens
- `verification.identifier` stores the purpose (e.g., email address or "password-reset")
- `verification.value` stores the token hash
- `verification.expiresAt` controls token expiry

## No New Migrations Required

All tables, enums, foreign keys, and indexes were created in migration `0001_hot_tempest.sql` (Feature 1). Feature 2 is purely application-level code.
