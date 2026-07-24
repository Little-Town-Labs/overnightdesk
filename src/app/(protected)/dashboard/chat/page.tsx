import { auth } from "@/lib/auth";
import { resolveSelectedAgentPageContext } from "@/db/selected-agent-page-context";
import { buildSelectedAgentCapabilities } from "@/lib/selected-agent-capabilities";
import { buildAgentWorkspaceComposition } from "@/lib/agent-workspace";
import { resolveAgentDirectory } from "@/lib/open-webui-workspace";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AgentWorkspace } from "./agent-workspace";
import { OpenChatUnavailable } from "./open-webui-workspace";
import { resolveAgentWorkspacePageContext } from "./page-resolution";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string | string[] }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const directory = await resolveAgentDirectory(session.user.id);
  const pageContext = await resolveSelectedAgentPageContext(
    session.user.id,
    directory,
  );
  const resolvedDirectory =
    pageContext.status === "available"
      ? pageContext.directory
      : ({ status: "unavailable" } as const);
  const instances =
    pageContext.status === "available" ? pageContext.instances : [];
  const rawAgent = (await searchParams).agent;
  if (Array.isArray(rawAgent)) notFound();

  const resolution = resolveAgentWorkspacePageContext(
    resolvedDirectory,
    rawAgent,
    instances,
  );
  if (resolution.status === "not_found") notFound();
  if (resolution.status === "unavailable") return <OpenChatUnavailable />;
  if (resolution.status === "empty") {
    return <OpenChatUnavailable reason="not-configured" />;
  }

  const selected = resolution.selected.agent;
  const selectedInstance = resolution.selected.instance;
  const capabilities = buildSelectedAgentCapabilities({
    agent: selected,
    instance: selectedInstance,
  });
  const composition = buildAgentWorkspaceComposition({
    agent: selected,
    capabilities,
  });
  if (composition.status === "unavailable") return <OpenChatUnavailable />;

  return (
    <AgentWorkspace agents={resolution.agents} composition={composition} />
  );
}
