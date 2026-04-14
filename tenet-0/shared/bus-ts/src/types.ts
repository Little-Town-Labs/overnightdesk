// Public types for the Tenet-0 TS client. Mirrors bus-go/types.go.
// See contracts/sdk-api.md for the full API contract.

export interface Config {
  // Libpq connection string. The library connects as the tenet0_app role; the
  // bus stored procedures authenticate per call via credential.
  postgresUrl: string;
  // Department identifier this process represents (e.g., "ops", "fin").
  department: string;
  // Bearer token for department; verified server-side against
  // departments.credential_hash (bcrypt).
  credential: string;
}

export interface Event {
  id: string;
  // Namespaced "<department>.<subject>.<verb>".
  type: string;
  source: string;
  // Decoded JSON payload. Use `JSON.parse(event.payload)` if you need a
  // structured view.
  payload: string;
  parentId: string;
  publishedAt: Date;
}

export interface PublishOptions {
  parentEventId?: string;
  approvalEventId?: string;
}

export type SubscriptionHandler = (event: Event) => Promise<void> | void;

export interface BudgetStatusResult {
  status: "ok" | "warning" | "blocked" | "unauthenticated";
  limitCents: number;
  spentCents: number;
  remainingCents: number;
}
