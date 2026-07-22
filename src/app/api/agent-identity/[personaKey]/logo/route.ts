import { createAgentPersonaLogoPointerHandler } from "./handler";
import { agentPersonaPresentationStore } from "@/db/agent-persona-presentation";

export const GET = createAgentPersonaLogoPointerHandler(
  agentPersonaPresentationStore,
);
