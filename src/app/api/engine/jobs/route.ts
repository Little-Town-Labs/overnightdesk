import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveInstance } from "@/lib/resolve-instance";
import { getJobs, createJob } from "@/lib/engine-client";

const createJobSchema = z.object({
  prompt: z.string().min(1).max(100_000),
  name: z.string().max(255).optional(),
});

// Rate limiter: 10 requests per 60 seconds per user
// Stored on globalThis so test infrastructure can reset between tests
const g = globalThis as unknown as Record<string, unknown>;
if (!(g.__jobCreateTimestamps instanceof Map)) {
  g.__jobCreateTimestamps = new Map<string, number[]>();
}
const jobCreateTimestamps = g.__jobCreateTimestamps as Map<string, number[]>;

function checkJobRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 10;

  const timestamps = jobCreateTimestamps.get(userId) ?? [];
  const recent = timestamps.filter((t) => now - t < windowMs);

  if (recent.length >= maxRequests) {
    jobCreateTimestamps.set(userId, recent);
    return false;
  }

  recent.push(now);
  jobCreateTimestamps.set(userId, recent);
  return true;
}

export async function GET(request: NextRequest) {
  const result = await resolveInstance();

  if (!result.ok) {
    return result.response;
  }

  const { subdomain, engineApiKey } = result.instance;
  const searchParams = request.nextUrl.searchParams;
  const params: Record<string, string> = {};

  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }

  const jobs = await getJobs(
    subdomain,
    engineApiKey,
    Object.keys(params).length > 0 ? params : undefined
  );

  return NextResponse.json({ success: true, data: jobs });
}

export async function POST(request: NextRequest) {
  const result = await resolveInstance();

  if (!result.ok) {
    return result.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = createJobSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

  const { userId, subdomain, engineApiKey } = result.instance;

  if (!checkJobRateLimit(userId)) {
    return NextResponse.json(
      { success: false, error: "Rate limit exceeded. Too many job creation requests." },
      { status: 429 }
    );
  }

  const job = await createJob(subdomain, engineApiKey, parsed.data);

  if (job === null) {
    return NextResponse.json(
      { success: false, error: "Engine unreachable" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, data: job });
}
