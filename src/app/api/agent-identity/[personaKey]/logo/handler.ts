import { NextRequest } from "next/server";

const DEFAULT_MARKS = {
  titus: "/agents/titus-mark.svg",
  walter: "/agents/walter-mark.svg",
} as const;

type SupportedPersonaKey = keyof typeof DEFAULT_MARKS;

export interface AgentPersonaLogoPointerDependencies {
  resolveLogoPointer(personaKey: SupportedPersonaKey): Promise<{
    runtimeIdentityId: string;
    sha256: string | null;
  } | null>;
}

function notFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

export function createAgentPersonaLogoPointerHandler(
  dependencies: AgentPersonaLogoPointerDependencies,
) {
  return async (
    request: NextRequest,
    context: { params: Promise<{ personaKey: string }> },
  ): Promise<Response> => {
    const { personaKey } = await context.params;
    if (!Object.hasOwn(DEFAULT_MARKS, personaKey)) return notFound();
    const verifiedKey = personaKey as SupportedPersonaKey;

    try {
      const pointer = await dependencies.resolveLogoPointer(verifiedKey);
      if (!pointer) return notFound();
      const target = pointer.sha256
        ? `/api/agent-identity/${pointer.runtimeIdentityId}/logo/${pointer.sha256}`
        : DEFAULT_MARKS[verifiedKey];
      return new Response(null, {
        status: 307,
        headers: {
          "Cache-Control": "no-store",
          Location: new URL(target, request.url).toString(),
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return notFound();
    }
  };
}
