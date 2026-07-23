import { auth } from "@/lib/auth";
import { db } from "@/db";
import { instance } from "@/db/schema";
import { buildSelectedAgentCapabilities } from "@/lib/selected-agent-capabilities";
import { buildAgentWorkspaceComposition } from "@/lib/agent-workspace";
import { resolveAgentDirectory } from "@/lib/open-webui-workspace";
import { eq } from "drizzle-orm";
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

  const [directory, instances] = await Promise.all([
    resolveAgentDirectory(session.user.id),
    db.select().from(instance).where(eq(instance.userId, session.user.id)),
  ]);
  const rawAgent = (await searchParams).agent;
  if (Array.isArray(rawAgent)) notFound();

  const resolution = resolveAgentWorkspacePageContext(
    directory,
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
