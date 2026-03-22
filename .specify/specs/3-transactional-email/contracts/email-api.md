# API Contract — Feature 3: Transactional Email

## Internal Service Interface

This feature does NOT expose new public API endpoints. Email sending is triggered internally by existing systems (Better Auth callbacks, Stripe webhook handlers, provisioning pipeline).

The email service exposes a TypeScript module interface consumed by other server-side code.

---

## Email Service Module: `src/lib/email.ts`

### `sendEmail(options: SendEmailOptions): Promise<EmailResult>`

Core send function with retry logic.

**Input:**
```typescript
interface SendEmailOptions {
  to: string;
  subject: string;
  react: React.ReactElement;  // React Email component
  text?: string;              // Plain text fallback
  emailType: EmailType;
  userId?: string;            // For logging
}
```

**Output:**
```typescript
interface EmailResult {
  success: boolean;
  messageId?: string;   // Resend message ID
  error?: string;       // Error message on failure
}
```

**Behavior:**
- Retries up to 3 times with exponential backoff (1s, 2s, 4s)
- Logs every attempt to `email_log` table
- Returns success/failure — never throws

---

## Email Functions (called by auth.ts, webhooks, provisioner)

### `sendVerificationEmail(user, url)`
- **Triggered by:** Better Auth `emailVerification.sendVerificationEmail` callback
- **Input:** `{ user: { email, name }, url: string }`
- **Email type:** `verification`
- **Unsubscribe:** No (essential)
- **Rate limit:** Handled by Better Auth (3/5min)

### `sendPasswordResetEmail(user, url)`
- **Triggered by:** Better Auth `emailAndPassword.sendResetPassword` callback
- **Input:** `{ user: { email, name }, url: string }`
- **Email type:** `password_reset`
- **Unsubscribe:** No (essential)
- **Rate limit:** Handled by Better Auth (3/5min)

### `sendWelcomeEmail(user, isWaitlistConvert)`
- **Triggered by:** Post-verification hook (or manual call after verification succeeds)
- **Input:** `{ user: { email, name, id }, isWaitlistConvert: boolean }`
- **Email type:** `welcome`
- **Unsubscribe:** Yes (non-essential, checks `emailOptOut`)
- **Rate limit:** Once per user (dedup by user_id + email_type)

### `sendPaymentFailureEmail(user, amount, portalUrl)`
- **Triggered by:** Stripe `invoice.payment_failed` webhook handler (Feature 4)
- **Input:** `{ user: { email, name }, amount: string, portalUrl: string }`
- **Email type:** `payment_failure`
- **Unsubscribe:** No (essential)
- **Rate limit:** Max 1 per user per 24 hours (dedup via email_log)

### `sendProvisioningEmail(user, dashboardUrl, bearerToken?)`
- **Triggered by:** Provisioning pipeline on instance status → `running` (Feature 5)
- **Input:** `{ user: { email, name }, dashboardUrl: string, bearerToken?: string }`
- **Email type:** `provisioning`
- **Unsubscribe:** Yes (non-essential, checks `emailOptOut`)
- **Rate limit:** Once per instance (dedup by user_id + email_type)

---

## Unsubscribe Endpoint

### `GET /api/email/unsubscribe?token=<jwt>`

One-click unsubscribe endpoint linked from non-essential emails.

**Query Parameters:**
- `token` — Signed JWT containing `{ userId, action: "unsubscribe" }`

**Response:**
- `200` — HTML page confirming unsubscribe
- `400` — Invalid or expired token

**Behavior:**
- Sets `user.emailOptOut = true`
- Displays confirmation page
- Does NOT require authentication (link must work from email)

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RESEND_API_KEY` | Yes | — | Resend API key (`re_...`) |
| `EMAIL_FROM` | No | `OvernightDesk <noreply@overnightdesk.com>` | Sender address |

---

## Email Template Components

Located in `src/lib/emails/`:

| Template | Used By | Unsubscribe Footer |
|----------|---------|-------------------|
| `VerificationEmail` | `sendVerificationEmail` | No |
| `PasswordResetEmail` | `sendPasswordResetEmail` | No |
| `WelcomeEmail` | `sendWelcomeEmail` | Yes |
| `PaymentFailureEmail` | `sendPaymentFailureEmail` | No |
| `ProvisioningEmail` | `sendProvisioningEmail` | Yes |
| `EmailLayout` | All templates | Shared layout wrapper |
