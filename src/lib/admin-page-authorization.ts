import { cache } from "react";
import { notFound, redirect } from "next/navigation";

interface AdminSession {
  user: { id?: string; email: string; name?: string };
}

export type AdminPageAccess = "allowed" | "forbidden" | "unauthenticated";

export function resolveAdminPageAccess(
  session: AdminSession | null,
  isAdminEmail: (email: string) => boolean,
): AdminPageAccess {
  if (!session) return "unauthenticated";
  return isAdminEmail(session.user.email) ? "allowed" : "forbidden";
}

export const requireAdminPage = cache(async () => {
  const [{ auth }, { headers }, { isInternalAdmin }] = await Promise.all([
    import("@/lib/auth"),
    import("next/headers"),
    import("@/lib/internal-authorization"),
  ]);
  const session = await auth.api.getSession({ headers: await headers() });
  const access = resolveAdminPageAccess(session, isInternalAdmin);

  if (access === "unauthenticated") redirect("/sign-in");
  if (access === "forbidden") notFound();
  return session!;
});
