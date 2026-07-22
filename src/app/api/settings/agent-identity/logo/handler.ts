import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  validateAgentPersonaLogo,
  type ValidAgentPersonaLogo,
} from "@/lib/agent-persona-logo";

type MutationOutcome = "updated" | "forbidden" | "unavailable";

export interface AgentPersonaLogoMutationDependencies {
  getSession(request: NextRequest): Promise<{ user: { id: string } } | null>;
  checkRateLimit(userId: string): boolean;
  replaceLogo(input: {
    actorUserId: string;
    runtimeIdentityId: string;
    logo: ValidAgentPersonaLogo;
  }): Promise<MutationOutcome>;
  removeLogo(input: {
    actorUserId: string;
    runtimeIdentityId: string;
  }): Promise<MutationOutcome>;
}

const runtimeIdentityIdSchema = z.string().uuid();
const deleteBodySchema = z.object({ runtimeIdentityId: runtimeIdentityIdSchema }).strict();
const MAX_MULTIPART_BODY_BYTES = 300 * 1024;
const MAX_JSON_BODY_BYTES = 1024;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

function validateSameOrigin(request: NextRequest): NextResponse | null {
  return request.headers.get("origin") === request.nextUrl.origin
    ? null
    : errorResponse(403, "FORBIDDEN", "Cross-origin mutation is not allowed.");
}

function contentLengthExceeds(request: NextRequest, limit: number): boolean {
  const value = request.headers.get("content-length");
  if (!value) return true;
  return !/^\d+$/.test(value) || Number(value) > limit;
}

function outcomeResponse(outcome: MutationOutcome): NextResponse {
  if (outcome === "updated") return NextResponse.json({ success: true });
  return outcome === "forbidden"
    ? errorResponse(403, "FORBIDDEN", "You cannot change this agent identity.")
    : errorResponse(
        503,
        "AUTHORITY_UNAVAILABLE",
        "Agent identity could not be updated right now.",
      );
}

const rateLimitState = globalThis as typeof globalThis & {
  __agentPersonaLogoMutationTimestamps?: Map<string, number[]>;
};
const mutationTimestamps =
  rateLimitState.__agentPersonaLogoMutationTimestamps ?? new Map<string, number[]>();
rateLimitState.__agentPersonaLogoMutationTimestamps = mutationTimestamps;

export function checkAgentPersonaLogoRateLimit(userId: string): boolean {
  const now = Date.now();
  const recent = (mutationTimestamps.get(userId) ?? []).filter(
    (timestamp) => now - timestamp < 10 * 60_000,
  );
  if (mutationTimestamps.size > 10_000) mutationTimestamps.clear();
  if (recent.length >= 5) return false;
  mutationTimestamps.set(userId, [...recent, now]);
  return true;
}

async function authenticate(
  request: NextRequest,
  dependencies: AgentPersonaLogoMutationDependencies,
): Promise<{ userId: string } | { response: NextResponse }> {
  const originError = validateSameOrigin(request);
  if (originError) return { response: originError };
  const session = await dependencies.getSession(request);
  if (!session) {
    return { response: errorResponse(401, "UNAUTHORIZED", "Authentication required.") };
  }
  if (!dependencies.checkRateLimit(session.user.id)) {
    return { response: errorResponse(429, "RATE_LIMITED", "Try again later.") };
  }
  return { userId: session.user.id };
}

async function parseLogoUpload(
  request: NextRequest,
): Promise<
  | { runtimeIdentityId: string; logo: ValidAgentPersonaLogo }
  | { response: NextResponse }
> {
  if (
    !request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data") ||
    contentLengthExceeds(request, MAX_MULTIPART_BODY_BYTES)
  ) {
    return { response: errorResponse(400, "INVALID_LOGO", "Choose a valid logo image.") };
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { response: errorResponse(400, "INVALID_LOGO", "Choose a valid logo image.") };
  }
  const entries = [...form.keys()];
  const runtimeIdentityId = form.get("runtimeIdentityId");
  const file = form.get("logo");
  if (
    entries.length !== 2 ||
    entries.filter((key) => key === "runtimeIdentityId").length !== 1 ||
    entries.filter((key) => key === "logo").length !== 1 ||
    typeof runtimeIdentityId !== "string" ||
    !runtimeIdentityIdSchema.safeParse(runtimeIdentityId).success ||
    !(file instanceof File)
  ) {
    return { response: errorResponse(400, "INVALID_LOGO", "Choose a valid logo image.") };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validated = validateAgentPersonaLogo({ contentType: file.type, bytes });
  return validated.ok
    ? { runtimeIdentityId, logo: validated.value }
    : { response: errorResponse(400, "INVALID_LOGO", "Choose a valid logo image.") };
}

export function createAgentPersonaLogoPostHandler(
  dependencies: AgentPersonaLogoMutationDependencies,
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const authentication = await authenticate(request, dependencies);
    if ("response" in authentication) return authentication.response;
    const parsed = await parseLogoUpload(request);
    if ("response" in parsed) return parsed.response;
    try {
      return outcomeResponse(
        await dependencies.replaceLogo({
          actorUserId: authentication.userId,
          runtimeIdentityId: parsed.runtimeIdentityId,
          logo: parsed.logo,
        }),
      );
    } catch {
      return outcomeResponse("unavailable");
    }
  };
}

async function parseDeleteBody(
  request: NextRequest,
): Promise<{ runtimeIdentityId: string } | { response: NextResponse }> {
  if (
    !request.headers.get("content-type")?.toLowerCase().startsWith("application/json") ||
    contentLengthExceeds(request, MAX_JSON_BODY_BYTES)
  ) {
    return { response: errorResponse(400, "INVALID_REQUEST", "A valid request is required.") };
  }
  try {
    const parsed = deleteBodySchema.safeParse(await request.json());
    return parsed.success
      ? parsed.data
      : { response: errorResponse(400, "INVALID_REQUEST", "A valid request is required.") };
  } catch {
    return { response: errorResponse(400, "INVALID_REQUEST", "A valid request is required.") };
  }
}

export function createAgentPersonaLogoDeleteHandler(
  dependencies: AgentPersonaLogoMutationDependencies,
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const authentication = await authenticate(request, dependencies);
    if ("response" in authentication) return authentication.response;
    const parsed = await parseDeleteBody(request);
    if ("response" in parsed) return parsed.response;
    try {
      return outcomeResponse(
        await dependencies.removeLogo({
          actorUserId: authentication.userId,
          runtimeIdentityId: parsed.runtimeIdentityId,
        }),
      );
    } catch {
      return outcomeResponse("unavailable");
    }
  };
}
