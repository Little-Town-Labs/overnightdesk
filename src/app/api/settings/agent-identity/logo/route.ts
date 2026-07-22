import { auth } from "@/lib/auth";
import type { NextRequest } from "next/server";
import { agentPersonaPresentationStore } from "@/db/agent-persona-presentation";
import {
  checkAgentPersonaLogoRateLimit,
  createAgentPersonaLogoDeleteHandler,
  createAgentPersonaLogoPostHandler,
} from "./handler";

export const dynamic = "force-dynamic";

const dependencies = {
  getSession: (request: NextRequest) =>
    auth.api.getSession({ headers: request.headers }),
  checkRateLimit: checkAgentPersonaLogoRateLimit,
  replaceLogo: agentPersonaPresentationStore.replaceLogo,
  removeLogo: agentPersonaPresentationStore.removeLogo,
};

export const POST = createAgentPersonaLogoPostHandler(dependencies);
export const DELETE = createAgentPersonaLogoDeleteHandler(dependencies);
