import { NextRequest, NextResponse } from "next/server";
import { resolveInstance } from "@/lib/resolve-instance";
import { getIssue, updateIssue } from "@/lib/engine-client";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await resolveInstance();
  if (!result.ok) return result.response;

  const { id } = await params;
  const { subdomain, engineApiKey } = result.instance;
  const data = await getIssue(subdomain, engineApiKey, id);

  if (!data) {
    return NextResponse.json(
      { success: false, error: "Issue not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await resolveInstance();
  if (!result.ok) return result.response;

  const { id } = await params;
  const { subdomain, engineApiKey } = result.instance;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Only allow safe fields to be updated
  const allowed = new Set(["title", "description", "status", "priority", "assignee_agent_id", "project_id", "billing_code"]);
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (allowed.has(key)) {
      updates[key] = value;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { success: false, error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const data = await updateIssue(subdomain, engineApiKey, id, updates);

  if (!data) {
    return NextResponse.json(
      { success: false, error: "Failed to update issue" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, data });
}
