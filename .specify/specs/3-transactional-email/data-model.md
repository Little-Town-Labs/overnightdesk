# Data Model — Feature 3: Transactional Email

## Schema Changes

### New Table: `email_log`

Tracks all transactional emails sent by the platform for support, debugging, and duplicate detection.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | serial | Primary Key | Auto-increment ID |
| user_id | text | FK → user.id, ON DELETE SET NULL | Recipient user (nullable for edge cases) |
| recipient_email | text | Not Null | Email address sent to |
| email_type | email_type_enum | Not Null | Category of email |
| resend_id | text | | Resend message ID for tracking |
| status | email_status_enum | Not Null, Default 'sent' | Delivery status |
| error | text | | Error message on failure |
| created_at | timestamptz | Not Null, Default now() | When the email was sent |

### New Enum: `email_type`

Values:
- `verification` — Email verification link
- `password_reset` — Password reset link
- `welcome` — Post-verification welcome email
- `payment_failure` — Payment failure notification
- `provisioning` — Instance ready notification

### New Enum: `email_status`

Values:
- `sent` — Successfully sent to provider
- `failed` — All retries exhausted, delivery failed

### Modified Table: `user`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| email_opt_out | boolean | Not Null, Default false | User opted out of non-essential emails |

This column controls whether non-essential emails (welcome, provisioning) are sent. Essential emails (verification, password reset, payment failure) bypass this flag.

## Relationships

- `email_log.user_id` → `user.id` (many-to-one, SET NULL on delete)
- User has many email logs

## Indexes

- `email_log(user_id)` — Look up email history for a user
- `email_log(recipient_email, email_type, created_at)` — Dedup check for payment failure emails (find recent sends of same type to same address)

## Migration Notes

- Adds 1 new table, 2 new enums, 1 new column on `user`
- Non-destructive — no existing data affected
- `user.email_opt_out` defaults to `false` (existing users receive all emails)
