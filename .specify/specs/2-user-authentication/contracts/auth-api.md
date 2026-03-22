# API Contract — User Authentication

## Base Path: `/api/auth`

All auth endpoints are handled by Better Auth's catch-all route handler at `/api/auth/[...all]/route.ts`. The routes below are provided by Better Auth — we configure them, not build them.

---

## Endpoints

### Registration

**POST** `/api/auth/sign-up/email`

Request:
```json
{
  "name": "string (required)",
  "email": "string (required, valid email)",
  "password": "string (required, min 12 chars)"
}
```

Response (201):
```json
{
  "token": "string (session token)",
  "user": {
    "id": "string",
    "name": "string",
    "email": "string",
    "emailVerified": false,
    "image": null,
    "createdAt": "ISO 8601",
    "updatedAt": "ISO 8601"
  }
}
```

Error (400): `{ "message": "..." }` — validation failure
Error (422): `{ "message": "..." }` — email already exists
Error (429): Rate limited

**Side effects:**
- Creates `user` row
- Creates `account` row (providerId: "credential", password: bcrypt hash)
- Creates `session` row
- Sends verification email (or console.log in dev)
- Sets session cookie

---

### Sign In

**POST** `/api/auth/sign-in/email`

Request:
```json
{
  "email": "string (required)",
  "password": "string (required)",
  "rememberMe": "boolean (optional, default false)"
}
```

Response (200):
```json
{
  "token": "string",
  "user": { ... }
}
```

Error (401): `{ "message": "Invalid email or password" }` — generic message
Error (429): Rate limited

**Side effects:**
- Creates `session` row
- Sets session cookie (expiry: 7 days default, 30 days if rememberMe)

---

### Sign Out

**POST** `/api/auth/sign-out`

Request: (empty body, session from cookie)

Response (200):
```json
{ "success": true }
```

**Side effects:**
- Deletes `session` row
- Clears session cookie

---

### Get Session

**GET** `/api/auth/get-session`

Response (200) — authenticated:
```json
{
  "session": {
    "id": "string",
    "userId": "string",
    "token": "string",
    "expiresAt": "ISO 8601",
    "ipAddress": "string | null",
    "userAgent": "string | null"
  },
  "user": {
    "id": "string",
    "name": "string",
    "email": "string",
    "emailVerified": true,
    "image": "string | null"
  }
}
```

Response (200) — unauthenticated:
```json
null
```

---

### Email Verification

**POST** `/api/auth/send-verification-email`

Request:
```json
{
  "email": "string (required)",
  "callbackURL": "string (optional)"
}
```

Response (200): `{ "status": true }`

**GET** `/api/auth/verify-email?token=...&callbackURL=...`

Response: Redirect to callbackURL with verified status

---

### Password Reset

**POST** `/api/auth/request-password-reset`

Request:
```json
{
  "email": "string (required)",
  "redirectTo": "string (optional)"
}
```

Response (200): `{ "status": true }` — always succeeds (no enumeration)

**POST** `/api/auth/reset-password`

Request:
```json
{
  "newPassword": "string (required, min 12 chars)",
  "token": "string (required)"
}
```

Response (200): `{ "status": true }`

**Side effects:**
- Updates password hash on `account` row
- Revokes all existing sessions

---

### Session Management

**GET** `/api/auth/list-sessions` — list all active sessions for current user
**POST** `/api/auth/revoke-session` — revoke a specific session by token
**POST** `/api/auth/revoke-sessions` — revoke all sessions

---

## Custom Platform Endpoints

These endpoints are NOT part of Better Auth. They are custom API routes.

### Waitlist Conversion Check (internal)

**GET** `/api/auth/waitlist-status?email=...`

This is NOT a public endpoint. It is called server-side during registration to check if the email exists in the waitlist. Implemented as a server-side utility function, not an API route.

---

## Cookie Configuration

| Property | Value |
|----------|-------|
| Name | `better-auth.session_token` |
| httpOnly | `true` |
| secure | `true` (production) |
| sameSite | `lax` |
| path | `/` |
| maxAge | 604800 (7 days) or 2592000 (30 days with rememberMe) |

---

## Rate Limiting

| Endpoint | Window | Max Requests |
|----------|--------|-------------|
| `/sign-in/email` | 60s | 10 |
| `/sign-up/email` | 60s | 5 |
| `/request-password-reset` | 300s (5 min) | 3 |
| `/send-verification-email` | 300s (5 min) | 3 |
| All others | 60s | 100 |
