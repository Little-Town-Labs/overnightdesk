import { z } from "zod";
import type { MembershipRole } from "@/lib/use-case-membership-authorization";
import { buildAgentPersonaLogoUrl } from "@/lib/agent-persona-logo";

export type AgentRuntimeStatus = "planned" | "active" | "suspended" | "retired";

export interface AgentIdentity {
  name: string;
  logo: {
    src: string;
    alt: string;
    custom?: boolean;
  };
}

export interface AgentWorkspaceRecord {
  useCaseId: string;
  runtimeIdentityId: string;
  runtimeSlug: string;
  runtimeStatus: AgentRuntimeStatus;
  membershipRole: MembershipRole;
  useCaseName: string;
  personaKey: string;
  personaName: string;
  personaLogoSha256: string | null;
  deploymentId: string | null;
  host: string | null;
}

export interface AgentDirectoryEntry {
  key: string;
  useCaseId: string;
  runtimeIdentityId: string;
  runtime: {
    slug: string;
    status: AgentRuntimeStatus;
  };
  membershipRole: MembershipRole;
  identity: AgentIdentity;
  useCaseName: string;
  workspace: AgentWorkspace | null;
}

export interface AgentWorkspace {
  key: string;
  identity: AgentIdentity;
  useCaseName: string;
  workspaceUrl: string;
  fallbackMessage: string;
}

export interface AgentDirectoryStore {
  listAuthorizedAgents(userId: string): Promise<AgentWorkspaceRecord[]>;
}

export type AgentDirectory =
  | { status: "available"; agents: AgentDirectoryEntry[] }
  | { status: "unavailable" };

export type AgentWorkspaceDirectory =
  | { status: "available"; workspaces: AgentWorkspace[] }
  | { status: "unavailable" };

interface AgentPresentation {
  logo: AgentIdentity["logo"];
  fallbackMessage: string;
}

const DEFAULT_AGENT_PRESENTATION: AgentPresentation = {
  logo: {
    src: "/agents/default-mark.svg",
    alt: "Agent mark",
  },
  fallbackMessage:
    "This agent's established approved channels remain available independently of Open Chat.",
};

// Presentation is data. Runtime, membership, and workspace assignment remain
// canonical database records and are never selected from this catalog.
const AGENT_PRESENTATION: Readonly<Record<string, AgentPresentation>> = {
  titus: {
    logo: {
      src: "/agents/titus-mark.svg",
      alt: "Titus agent mark",
    },
    fallbackMessage:
      "Your existing Titus Matrix room and approved email channel remain available and independent of Open Chat.",
  },
  walter: {
    logo: {
      src: "/agents/walter-mark.svg",
      alt: "Walter agent mark",
    },
    fallbackMessage:
      "Walter's existing advanced runtime dashboard remains available independently of Open Chat.",
  },
};

const workspaceRecordSchema = z
  .object({
    useCaseId: z.string().uuid(),
    runtimeIdentityId: z.string().uuid(),
    runtimeSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(128),
    runtimeStatus: z.enum(["planned", "active", "suspended", "retired"]),
    membershipRole: z.enum(["owner", "operator", "member", "viewer"]),
    useCaseName: z.string().min(1).max(160),
    personaKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
    personaName: z.string().min(1).max(120),
    personaLogoSha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    deploymentId: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(128)
      .nullable(),
    host: z.string().min(1).max(253).nullable(),
  })
  .strict();

function parseAgentRecord(record: AgentWorkspaceRecord): AgentDirectoryEntry | null {
  const parsed = workspaceRecordSchema.safeParse(record);
  if (!parsed.success) return null;

  const {
    deploymentId,
    host,
    personaKey,
    personaName,
    personaLogoSha256,
    runtimeIdentityId,
    runtimeSlug,
    runtimeStatus,
    membershipRole,
    useCaseId,
    useCaseName,
  } = parsed.data;
  if ((deploymentId === null) !== (host === null)) return null;

  const presentation = AGENT_PRESENTATION[personaKey] ?? DEFAULT_AGENT_PRESENTATION;
  const logo = personaLogoSha256
    ? {
        src: buildAgentPersonaLogoUrl(runtimeIdentityId, personaLogoSha256),
        alt: `${personaName} agent mark`,
        custom: true,
      }
    : presentation.logo;
  const identity = {
    name: personaName,
    logo,
  };
  if (host === null) {
    return {
      key: personaKey,
      useCaseId,
      runtimeIdentityId,
      runtime: { slug: runtimeSlug, status: runtimeStatus },
      membershipRole,
      identity,
      useCaseName,
      workspace: null,
    };
  }

  const workspaceUrl = new URL(`https://${host}/`);
  if (
    workspaceUrl.hostname !== host ||
    workspaceUrl.port ||
    host !== host.toLowerCase() ||
    !host.endsWith(".overnightdesk.com")
  ) {
    return null;
  }

  return {
    key: personaKey,
    useCaseId,
    runtimeIdentityId,
    runtime: { slug: runtimeSlug, status: runtimeStatus },
    membershipRole,
    identity,
    useCaseName,
    workspace: {
      key: personaKey,
      identity,
      useCaseName,
      workspaceUrl: workspaceUrl.toString(),
      fallbackMessage: presentation.fallbackMessage,
    },
  };
}

async function defaultAgentDirectoryStore(): Promise<AgentDirectoryStore> {
  const { openWebuiWorkspaceDirectoryStore } = await import(
    "@/db/open-webui-workspace-directory"
  );
  return openWebuiWorkspaceDirectoryStore;
}

export async function resolveAgentDirectory(
  userId: string,
  store?: AgentDirectoryStore,
): Promise<AgentDirectory> {
  if (!userId || userId.length > 255) return { status: "unavailable" };

  try {
    const directoryStore = store ?? (await defaultAgentDirectoryStore());
    const records = await directoryStore.listAuthorizedAgents(userId);
    const agents = records.map(parseAgentRecord);
    if (agents.some((agent) => agent === null)) {
      return { status: "unavailable" };
    }

    const verified = (agents as AgentDirectoryEntry[]).sort((left, right) =>
      left.identity.name.localeCompare(right.identity.name),
    );
    const keys = new Set(verified.map((agent) => agent.key));
    const workspaceUrls = verified.flatMap((agent) =>
      agent.workspace ? [agent.workspace.workspaceUrl] : [],
    );
    if (
      keys.size !== verified.length ||
      new Set(workspaceUrls).size !== workspaceUrls.length
    ) {
      return { status: "unavailable" };
    }

    return { status: "available", agents: verified };
  } catch {
    return { status: "unavailable" };
  }
}

export async function resolveAgentWorkspaceDirectory(
  userId: string,
  store?: AgentDirectoryStore,
): Promise<AgentWorkspaceDirectory> {
  const directory = await resolveAgentDirectory(userId, store);
  if (directory.status === "unavailable") return directory;
  return {
    status: "available",
    workspaces: directory.agents.flatMap((agent) =>
      agent.workspace ? [agent.workspace] : [],
    ),
  };
}

export function selectAgentWorkspace(
  workspaces: AgentWorkspace[],
  requestedKey?: string,
): AgentWorkspace | null {
  if (workspaces.length === 0) return null;
  if (requestedKey === undefined) return workspaces[0];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requestedKey)) return null;
  return workspaces.find((workspace) => workspace.key === requestedKey) ?? null;
}

export function selectAgentDirectoryEntry(
  agents: AgentDirectoryEntry[],
  requestedKey?: string,
): AgentDirectoryEntry | null {
  if (agents.length === 0) return null;
  if (requestedKey === undefined) return agents[0];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requestedKey)) return null;
  return agents.find((agent) => agent.key === requestedKey) ?? null;
}
