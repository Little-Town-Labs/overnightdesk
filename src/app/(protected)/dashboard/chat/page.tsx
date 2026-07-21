import { auth } from "@/lib/auth";
import {
  resolveAgentWorkspaceDirectory,
  selectAgentWorkspace,
} from "@/lib/open-webui-workspace";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  OpenChatUnavailable,
  OpenWebuiWorkspace,
} from "./open-webui-workspace";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string | string[] }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const directory = await resolveAgentWorkspaceDirectory(session.user.id);
  if (directory.status === "unavailable") return <OpenChatUnavailable />;

  const rawAgent = (await searchParams).agent;
  if (Array.isArray(rawAgent)) notFound();
  if (directory.workspaces.length === 0) {
    if (rawAgent) notFound();
    return <OpenChatUnavailable reason="not-configured" />;
  }
  const selected = selectAgentWorkspace(directory.workspaces, rawAgent);
  if (!selected) notFound();

  return (
    <OpenWebuiWorkspace
      selected={selected}
      workspaces={directory.workspaces}
    />
  );
}
