import { NextRequest, NextResponse } from "next/server";
import { resolveInstance } from "@/lib/resolve-instance";
import { getJob, deleteJob } from "@/lib/engine-client";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await resolveInstance();

  if (!result.ok) {
    return result.response;
  }

  const { id } = await params;
  const { subdomain, engineApiKey } = result.instance;
  const job = await getJob(subdomain, engineApiKey, id);

  if (job === null) {
    return NextResponse.json(
      { success: false, error: "Engine unreachable" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, data: job });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await resolveInstance();

  if (!result.ok) {
    return result.response;
  }

  const { id } = await params;
  const { subdomain, engineApiKey } = result.instance;
  const deleted = await deleteJob(subdomain, engineApiKey, id);

  if (deleted === null) {
    return NextResponse.json(
      { success: false, error: "Engine unreachable" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, data: deleted });
}
