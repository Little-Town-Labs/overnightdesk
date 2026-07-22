import { agentPersonaPresentationStore } from "@/db/agent-persona-presentation";
import { createAgentPersonaLogoGetHandler } from "./handler";

export const dynamic = "force-dynamic";

export const GET = createAgentPersonaLogoGetHandler({
  readLogo: agentPersonaPresentationStore.readLogo,
});
