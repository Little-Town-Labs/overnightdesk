import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { isAdmin } from "@/lib/billing";

type AdminResult =
  | {
      ok: true;
      session: { user: { id: string; email: string; name: string } };
    }
  | { ok: false; response: NextResponse };

export async function requireAdmin(): Promise<AdminResult> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  if (!isAdmin(session.user.email)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, session };
}
