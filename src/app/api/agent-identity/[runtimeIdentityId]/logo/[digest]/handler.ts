import { NextRequest } from "next/server";
import { z } from "zod";
import type { AgentPersonaLogoContentType } from "@/lib/agent-persona-logo";

export interface AgentPersonaLogoReadDependencies {
  readLogo(input: {
    runtimeIdentityId: string;
    sha256: string;
  }): Promise<{ contentType: AgentPersonaLogoContentType; bytes: Uint8Array } | null>;
}

const paramsSchema = z.object({
  runtimeIdentityId: z.string().uuid(),
  digest: z.string().regex(/^[0-9a-f]{64}$/),
});

function notFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

export function createAgentPersonaLogoGetHandler(
  dependencies: AgentPersonaLogoReadDependencies,
) {
  return async (
    _request: NextRequest,
    context: {
      params: Promise<{ runtimeIdentityId: string; digest: string }>;
    },
  ): Promise<Response> => {
    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) return notFound();
    try {
      const logo = await dependencies.readLogo({
        runtimeIdentityId: parsed.data.runtimeIdentityId,
        sha256: parsed.data.digest,
      });
      if (!logo) return notFound();
      return new Response(Uint8Array.from(logo.bytes).buffer, {
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable",
          "Content-Type": logo.contentType,
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return notFound();
    }
  };
}
