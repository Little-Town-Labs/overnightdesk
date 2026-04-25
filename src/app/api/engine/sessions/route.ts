import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getInstanceForUser, isHermesTenant } from "@/lib/instance";
import { provisionerClient } from "@/lib/provisioner";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const inst = await getInstanceForUser(session.user.id);
  if (!inst || !isHermesTenant(inst) || !inst.containerId) {
    return NextResponse.json({ error: "No hermes instance" }, { status: 400 });
  }

  const data = await provisionerClient.getSessions(inst.containerId);
  if (!data) {
    return NextResponse.json({ sessions: [] });
  }

  return NextResponse.json(data);
}
