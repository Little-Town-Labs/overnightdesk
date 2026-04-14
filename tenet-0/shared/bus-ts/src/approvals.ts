import type { Bus } from "./bus.js";

export interface PerActionOptions {
  // ID of the pending request event this approval targets (the one the
  // requesting department published as `<dept>.approval.requested`).
  targetEventId: string;
  // Free-form scope descriptor recorded in the payload for audit.
  scope: string;
  // Validity window from now. If omitted, the SP applies its default (10 min).
  expiresInMs?: number;
  reason?: string;
}

export interface BlanketOptions {
  category: string;
  // Category-specific shape (e.g. {max_amount_cents: 10000}). Optional.
  constraints?: Record<string, unknown>;
  expiresAt?: Date;
  reason?: string;
}

// Approvals is the President-side API for granting and revoking approvals.
// The library does not enforce "president-only" — that's a stored-procedure
// namespace rule; non-president callers receive ErrNamespaceViolation from
// the underlying Publish.
export class Approvals {
  private readonly bus: Bus;

  constructor(bus: Bus) {
    this.bus = bus;
  }

  async grantPerAction(opts: PerActionOptions): Promise<string> {
    const payload: Record<string, unknown> = {
      approves_event_id: opts.targetEventId,
      scope: opts.scope,
      reason: opts.reason ?? "",
    };
    if (opts.expiresInMs && opts.expiresInMs > 0) {
      payload.expires_at = new Date(
        Date.now() + opts.expiresInMs,
      ).toISOString();
    }
    return this.bus.publish("president.approved", JSON.stringify(payload));
  }

  async grantBlanket(opts: BlanketOptions): Promise<string> {
    const payload: Record<string, unknown> = {
      category: opts.category,
      reason: opts.reason ?? "",
    };
    if (opts.expiresAt) {
      payload.expires_at = opts.expiresAt.toISOString();
    }
    if (opts.constraints) {
      payload.constraints = opts.constraints;
    }
    return this.bus.publish(
      "president.authorization.granted",
      JSON.stringify(payload),
    );
  }

  // revoke looks up the blanket approval's category from approvals_active so
  // callers only need the original approval event ID. Throws if the ID does
  // not correspond to an active blanket approval.
  async revoke(approvalEventId: string, reason: string): Promise<string> {
    const { rows } = await this.bus.pool.query<{ category: string | null }>(
      `SELECT category FROM approvals_active
        WHERE approval_event_id = $1 AND kind = 'blanket' LIMIT 1`,
      [approvalEventId],
    );
    const category = rows[0]?.category;
    if (!category) {
      throw new Error(
        `approvals: blanket approval ${approvalEventId} not found or has no category`,
      );
    }
    return this.bus.publish(
      "president.authorization.revoked",
      JSON.stringify({
        category,
        revoked_approval_id: approvalEventId,
        reason,
      }),
    );
  }
}
