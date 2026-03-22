import { randomBytes } from "crypto";
import { hash } from "bcryptjs";
import { db } from "@/db";
import { instance, fleetEvent } from "@/db/schema";
import { eq } from "drizzle-orm";

const PORT_MIN = 4000;
const PORT_MAX = 4999;

export async function getInstanceForUser(userId: string) {
  const rows = await db.select().from(instance).where(eq(instance.userId, userId));
  return rows[0] ?? null;
}

export function generateTenantId(userId: string): string {
  return userId.replace(/-/g, "").slice(0, 12).toLowerCase();
}

export async function allocatePort(): Promise<number> {
  const rows = await db
    .select({ gatewayPort: instance.gatewayPort })
    .from(instance);

  const usedPorts = new Set(
    rows.map((r) => r.gatewayPort).filter((p): p is number => p !== null)
  );

  for (let port = PORT_MIN; port <= PORT_MAX; port++) {
    if (!usedPorts.has(port)) {
      return port;
    }
  }

  throw new Error("No available ports in range 4000-4999");
}

export function generateBearerToken(): string {
  return randomBytes(32).toString("hex");
}

export async function hashToken(token: string): Promise<string> {
  return hash(token, 10);
}

export async function createInstance(
  userId: string,
  plan: "starter" | "pro"
): Promise<{
  instance: typeof instance.$inferSelect;
  plaintextToken: string | null;
}> {
  // Idempotency: check if instance already exists
  const existing = await db
    .select()
    .from(instance)
    .where(eq(instance.userId, userId));

  if (existing.length > 0) {
    return { instance: existing[0], plaintextToken: null };
  }

  const tenantId = generateTenantId(userId);
  const port = await allocatePort();
  const plaintextToken = generateBearerToken();
  const tokenHash = await hashToken(plaintextToken);
  const engineApiKey = generateBearerToken();
  const subdomain = `${tenantId}.overnightdesk.com`;

  const [created] = await db
    .insert(instance)
    .values({
      userId,
      tenantId,
      status: "queued",
      gatewayPort: port,
      dashboardTokenHash: tokenHash,
      engineApiKey,
      subdomain,
    })
    .returning();

  await db.insert(fleetEvent).values({
    instanceId: created.id,
    eventType: "instance.queued",
    details: { plan, tenantId, port },
  });

  return { instance: created, plaintextToken };
}

export async function updateInstanceStatus(
  tenantId: string,
  status: string,
  details?: Record<string, unknown>,
  extraFields?: Record<string, unknown>
): Promise<void> {
  const now = new Date();
  const updateFields: Record<string, unknown> = {
    status,
    updatedAt: now,
    ...extraFields,
  };

  if (status === "running") {
    updateFields.provisionedAt = now;
  }

  if (status === "deprovisioned") {
    updateFields.deprovisionedAt = now;
  }

  const [updated] = await db
    .update(instance)
    .set(updateFields)
    .where(eq(instance.tenantId, tenantId))
    .returning({ id: instance.id });

  if (updated) {
    await db.insert(fleetEvent).values({
      instanceId: updated.id,
      eventType: `instance.${status}`,
      details: details ?? null,
    });
  }
}
