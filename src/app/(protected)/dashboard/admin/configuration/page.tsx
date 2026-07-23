import { notFound } from "next/navigation";
import { db } from "@/db";
import { instance } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdminPage } from "@/lib/admin-page-authorization";
import { resolveManagedVariableControlDescriptors } from "@/db/managed-agent-variable-boundary";
import { buildSelectedAgentCapabilities } from "@/lib/selected-agent-capabilities";
import { resolveAgentDirectory } from "@/lib/open-webui-workspace";
import {
  getSelectedAgentStatusLabel,
  resolveSelectedAgentContext,
} from "@/lib/selected-agent-context";
import { AgentAccessState } from "../../agent-access-state";
import { AdminAgentConfiguration } from "./admin-agent-configuration";

export default async function AdminConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string | string[] }>;
}) {
  const session = await requireAdminPage();
  const [instances, directory] = await Promise.all([
    db.select().from(instance).where(eq(instance.userId, session.user.id)),
    resolveAgentDirectory(session.user.id),
  ]);
  const rawAgent = (await searchParams).agent;
  if (Array.isArray(rawAgent)) notFound();

  const resolution = resolveSelectedAgentContext(directory, rawAgent, instances);
  if (resolution.status === "not_found") notFound();
  if (resolution.status !== "available") {
    return (
      <section aria-labelledby="admin-configuration-heading" className="space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--color-od-accent)", fontFamily: "var(--font-mono)" }}>
            Selected-agent scope
          </p>
          <h2 className="mt-1 text-xl font-semibold" id="admin-configuration-heading" style={{ color: "var(--color-od-text)" }}>
            Configuration
          </h2>
        </div>
        <AgentAccessState state={resolution.status} />
      </section>
    );
  }

  const { agent, instance: selectedInstance } = resolution.selected;
  const managedVariables = await resolveManagedVariableControlDescriptors({
    agent,
    instance: selectedInstance,
  });

  return (
    <AdminAgentConfiguration
      agents={resolution.agents}
      capabilities={buildSelectedAgentCapabilities({
        agent,
        instance: selectedInstance,
      })}
      managedVariables={managedVariables}
      selected={agent}
      statusLabel={getSelectedAgentStatusLabel(agent, selectedInstance)}
    />
  );
}
