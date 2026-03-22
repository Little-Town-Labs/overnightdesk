import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getInstanceForUser } from "@/lib/instance";

interface ResolvedInstance {
  subdomain: string;
  engineApiKey: string;
  tenantId: string;
  userId: string;
}

type ResolveResult =
  | { ok: true; instance: ResolvedInstance }
  | { ok: false; response: NextResponse };

export async function resolveInstance(): Promise<ResolveResult> {
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

  const instance = await getInstanceForUser(session.user.id);

  if (!instance) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Instance not found" },
        { status: 404 }
      ),
    };
  }

  if (instance.status !== "running") {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Instance not running" },
        { status: 404 }
      ),
    };
  }

  if (!instance.subdomain || !instance.engineApiKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Instance not found" },
        { status: 404 }
      ),
    };
  }

  return {
    ok: true,
    instance: {
      subdomain: instance.subdomain,
      engineApiKey: instance.engineApiKey,
      tenantId: instance.tenantId,
      userId: session.user.id,
    },
  };
}
