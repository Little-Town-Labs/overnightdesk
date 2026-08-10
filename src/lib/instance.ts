import { cache } from "react";
import { db } from "@/db";
import { instance } from "@/db/schema";
import { eq } from "drizzle-orm";

export { isHermesTenant } from "@/lib/hermes-tenant";

export const getInstanceForUser = cache(async (userId: string) => {
  const rows = await db.select().from(instance).where(eq(instance.userId, userId));
  return rows[0] ?? null;
});

export function isHermesMitchelTenant(
  inst: { tenantId: string; containerId: string | null } | null
): boolean {
  return inst?.tenantId === "hermes-mitchel" || inst?.containerId === "hermes-mitchel";
}
