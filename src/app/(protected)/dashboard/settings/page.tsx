import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { resolveSelectedAgentPageContext } from "@/db/selected-agent-page-context";
import { resolveAgentDirectory } from "@/lib/open-webui-workspace";
import {
  getSelectedAgentStatusLabel,
  resolveSelectedAgentContext,
} from "@/lib/selected-agent-context";
import { buildSelectedAgentCapabilities } from "@/lib/selected-agent-capabilities";
import { resolveManagedVariableControlDescriptors } from "@/db/managed-agent-variable-boundary";
import { ChangePassword } from "./change-password";
import { SelectedAgentConfiguration } from "../selected-agent-configuration";
import { SettingsSurface } from "./settings-surface";

export default async function SettingsPage({
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

  const resolution = resolveSelectedAgentContext(
    resolvedDirectory,
    rawAgent,
    instances,
  );
  if (resolution.status === "not_found") notFound();

  const accountProps = {
    accountSecurity: <ChangePassword />,
    email: session.user.email,
    name: session.user.name,
  };

  if (resolution.status !== "available") {
    return <SettingsSurface {...accountProps} agentState={resolution.status} />;
  }

  const { agent, instance: selectedInstance } = resolution.selected;
  const capabilities = buildSelectedAgentCapabilities({
    agent,
    instance: selectedInstance,
  });
  const managedVariables = await resolveManagedVariableControlDescriptors({
    agent,
    instance: selectedInstance,
  });

  return (
    <SettingsSurface
      {...accountProps}
      agentContent={
        <SelectedAgentConfiguration
          agents={resolution.agents}
          capabilities={capabilities}
          managedVariables={managedVariables}
          selected={agent}
          statusLabel={getSelectedAgentStatusLabel(agent, selectedInstance)}
        />
      }
    />
  );
}
