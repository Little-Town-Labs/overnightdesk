import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks - declared before imports so jest.mock hoisting works correctly
// ---------------------------------------------------------------------------

jest.mock("next/headers", () => ({
  headers: jest.fn(() => Promise.resolve(new Headers())),
}));

jest.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

jest.mock("@/db", () => {
  const selectChain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
  };
  const insertChain = {
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([{ id: 1 }]),
  };
  const deleteChain = {
    where: jest.fn().mockResolvedValue([{ id: "user_123" }]),
  };
  return {
    db: {
      select: jest.fn(() => selectChain),
      insert: jest.fn(() => insertChain),
      delete: jest.fn(() => deleteChain),
      _selectChain: selectChain,
      _insertChain: insertChain,
      _deleteChain: deleteChain,
    },
  };
});

jest.mock("@/db/schema", () => ({
  user: { id: "id", email: "email" },
  account: { userId: "user_id", providerId: "provider_id", password: "password" },
  subscription: {
    userId: "user_id",
    status: "status",
    stripeSubscriptionId: "stripe_subscription_id",
  },
  platformAuditLog: {
    actor: "actor",
    action: "action",
    target: "target",
    details: "details",
  },
}));

jest.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: {
      cancel: jest.fn(),
    },
  },
}));

jest.mock("bcryptjs", () => ({
  compare: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { stripe } from "@/lib/stripe";
import bcrypt from "bcryptjs";

// We import the route handler. This will fail (RED) until the route is implemented.
// eslint-disable-next-line @typescript-eslint/no-var-requires
let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  try {
    const mod = await import("@/app/api/account/delete/route");
    POST = mod.POST;
  } catch {
    // Route does not exist yet - expected in TDD RED phase.
    // Each test will fail with a clear message.
    POST = () => {
      throw new Error(
        "Route not implemented: src/app/api/account/delete/route.ts"
      );
    };
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/account/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const mockSession = {
  user: {
    id: "user_123",
    email: "test@example.com",
    name: "Test User",
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  session: {
    id: "session_abc",
    userId: "user_123",
    expiresAt: new Date(Date.now() + 86400000),
  },
};

const mockSubscription = {
  id: "sub_db_1",
  userId: "user_123",
  stripeCustomerId: "cus_abc",
  stripeSubscriptionId: "sub_stripe_xyz",
  plan: "starter",
  status: "active",
  currentPeriodEnd: new Date(Date.now() + 2592000000),
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/account/delete", () => {
  const getSession = auth.api.getSession as jest.Mock;
  const dbSelect = (db as unknown as { _selectChain: { from: jest.Mock; where: jest.Mock } })._selectChain;
  const dbInsert = (db as unknown as { _insertChain: { values: jest.Mock; returning: jest.Mock } })._insertChain;
  const dbDelete = (db as unknown as { _deleteChain: { where: jest.Mock } })._deleteChain;
  const stripeCancel = stripe.subscriptions.cancel as jest.Mock;
  const bcryptCompare = bcrypt.compare as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Authentication
  // -------------------------------------------------------------------------

  it("returns 401 when no session exists", async () => {
    getSession.mockResolvedValueOnce(null);

    const request = makeRequest({ password: "s3cur3Pa$$word!", confirmation: "DELETE" });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 2. Validation - missing password
  // -------------------------------------------------------------------------

  it("returns 400 when request body is missing password", async () => {
    getSession.mockResolvedValueOnce(mockSession);

    const request = makeRequest({ confirmation: "DELETE" });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 3. Validation - confirmation is not "DELETE"
  // -------------------------------------------------------------------------

  it('returns 400 when confirmation is not exactly "DELETE"', async () => {
    getSession.mockResolvedValueOnce(mockSession);

    const request = makeRequest({ password: "s3cur3Pa$$word!", confirmation: "delete" });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 4. Password verification failure
  // -------------------------------------------------------------------------

  it("returns 401 when password is incorrect", async () => {
    getSession.mockResolvedValueOnce(mockSession);
    // DB returns the user record with hashed password
    dbSelect.where.mockResolvedValueOnce([
      { id: "user_123", email: "test@example.com", password: "$2b$10$hashedpassword" },
    ]);
    bcryptCompare.mockResolvedValueOnce(false);

    const request = makeRequest({ password: "wrongpassword!", confirmation: "DELETE" });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 5. Success with active subscription - cancels via Stripe
  // -------------------------------------------------------------------------

  it("returns 200 and cancels Stripe subscription when user has active subscription", async () => {
    getSession.mockResolvedValueOnce(mockSession);
    // User lookup with password
    dbSelect.where
      .mockResolvedValueOnce([
        { id: "user_123", email: "test@example.com", password: "$2b$10$hashedpassword" },
      ])
      // Subscription lookup
      .mockResolvedValueOnce([mockSubscription]);
    bcryptCompare.mockResolvedValueOnce(true);
    stripeCancel.mockResolvedValueOnce({ id: "sub_stripe_xyz", status: "canceled" });
    // Audit log insert
    dbInsert.returning.mockResolvedValueOnce([{ id: 1 }]);
    // User deletion
    dbDelete.where.mockResolvedValueOnce([{ id: "user_123" }]);

    const request = makeRequest({ password: "s3cur3Pa$$word!", confirmation: "DELETE" });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(stripeCancel).toHaveBeenCalledWith("sub_stripe_xyz");
    expect((db.insert as jest.Mock)).toHaveBeenCalled();
    expect((db.delete as jest.Mock)).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. Success without subscription - no Stripe call
  // -------------------------------------------------------------------------

  it("returns 200 without calling Stripe when user has no subscription", async () => {
    getSession.mockResolvedValueOnce(mockSession);
    // User lookup with password
    dbSelect.where
      .mockResolvedValueOnce([
        { id: "user_123", email: "test@example.com", password: "$2b$10$hashedpassword" },
      ])
      // Subscription lookup - empty
      .mockResolvedValueOnce([]);
    bcryptCompare.mockResolvedValueOnce(true);
    // Audit log insert
    dbInsert.returning.mockResolvedValueOnce([{ id: 1 }]);
    // User deletion
    dbDelete.where.mockResolvedValueOnce([{ id: "user_123" }]);

    const request = makeRequest({ password: "s3cur3Pa$$word!", confirmation: "DELETE" });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(stripeCancel).not.toHaveBeenCalled();
    expect((db.delete as jest.Mock)).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 7. Stripe cancellation failure blocks deletion
  // -------------------------------------------------------------------------

  it("returns 500 and blocks deletion when Stripe cancellation fails", async () => {
    getSession.mockResolvedValueOnce(mockSession);
    // User lookup with password
    dbSelect.where
      .mockResolvedValueOnce([
        { id: "user_123", email: "test@example.com", password: "$2b$10$hashedpassword" },
      ])
      // Subscription lookup
      .mockResolvedValueOnce([mockSubscription]);
    bcryptCompare.mockResolvedValueOnce(true);
    stripeCancel.mockRejectedValueOnce(new Error("Stripe API error"));

    const request = makeRequest({ password: "s3cur3Pa$$word!", confirmation: "DELETE" });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
    // Verify user was NOT deleted
    expect((db.delete as jest.Mock)).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 8. Audit log entry created on successful deletion
  // -------------------------------------------------------------------------

  it("creates an audit log entry on successful deletion", async () => {
    getSession.mockResolvedValueOnce(mockSession);
    // User lookup with password
    dbSelect.where
      .mockResolvedValueOnce([
        { id: "user_123", email: "test@example.com", password: "$2b$10$hashedpassword" },
      ])
      // No subscription
      .mockResolvedValueOnce([]);
    bcryptCompare.mockResolvedValueOnce(true);
    dbInsert.returning.mockResolvedValueOnce([{ id: 1 }]);
    dbDelete.where.mockResolvedValueOnce([{ id: "user_123" }]);

    const request = makeRequest({ password: "s3cur3Pa$$word!", confirmation: "DELETE" });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify audit log was inserted with correct values
    expect((db.insert as jest.Mock)).toHaveBeenCalled();
    expect(dbInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "user_123",
        action: "account_deleted",
      })
    );
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it("returns 400 when request body is empty", async () => {
    getSession.mockResolvedValueOnce(mockSession);

    const request = new NextRequest("http://localhost/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it("returns 400 when confirmation has extra whitespace", async () => {
    getSession.mockResolvedValueOnce(mockSession);

    const request = makeRequest({ password: "s3cur3Pa$$word!", confirmation: " DELETE " });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it("returns 400 when password is an empty string", async () => {
    getSession.mockResolvedValueOnce(mockSession);

    const request = makeRequest({ password: "", confirmation: "DELETE" });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });
});
