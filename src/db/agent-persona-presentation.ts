import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  personaAssignment,
  platformAuditLog,
  runtimeIdentity,
  useCase,
  useCaseMembership,
} from "@/db/schema";
import {
  validateAgentPersonaLogo,
  type AgentPersonaLogoContentType,
  type ValidAgentPersonaLogo,
} from "@/lib/agent-persona-logo";

type Database = typeof db;
type MutationOutcome = "updated" | "forbidden" | "unavailable";

function ownerRuntimeIds(
  database: Database,
  actorUserId: string,
  runtimeIdentityId: string,
) {
  return database
    .select({ id: runtimeIdentity.id })
    .from(useCaseMembership)
    .innerJoin(
      runtimeIdentity,
      and(
        eq(runtimeIdentity.useCaseId, useCaseMembership.useCaseId),
        or(
          isNull(useCaseMembership.runtimeIdentityId),
          eq(useCaseMembership.runtimeIdentityId, runtimeIdentity.id),
        ),
      ),
    )
    .innerJoin(useCase, eq(useCase.id, runtimeIdentity.useCaseId))
    .where(
      and(
        eq(useCaseMembership.userId, actorUserId),
        eq(useCaseMembership.role, "owner"),
        eq(useCaseMembership.status, "active"),
        or(
          isNull(useCaseMembership.expiresAt),
          gt(useCaseMembership.expiresAt, new Date()),
        ),
        eq(useCase.status, "active"),
        eq(runtimeIdentity.status, "active"),
        eq(runtimeIdentity.id, runtimeIdentityId),
      ),
    );
}

export function createAgentPersonaPresentationStore(database: Database = db) {
  async function mutate({
    actorUserId,
    runtimeIdentityId,
    logo,
  }: {
    actorUserId: string;
    runtimeIdentityId: string;
    logo: ValidAgentPersonaLogo | null;
  }): Promise<MutationOutcome> {
    const updatedAt = new Date();
    const update = database
      .update(personaAssignment)
      .set({
        logoContentType: logo?.contentType ?? null,
        logoDataBase64: logo?.dataBase64 ?? null,
        logoSha256: logo?.sha256 ?? null,
        updatedAt,
      })
      .where(
        and(
          eq(personaAssignment.runtimeIdentityId, runtimeIdentityId),
          eq(personaAssignment.isDefault, true),
          eq(personaAssignment.status, "active"),
          inArray(
            personaAssignment.runtimeIdentityId,
            ownerRuntimeIds(database, actorUserId, runtimeIdentityId),
          ),
        ),
      )
      .returning({ id: personaAssignment.id });
    const audit = database.insert(platformAuditLog).values({
      actor: actorUserId,
      action: logo
        ? "agent_persona_logo.replace_attempted"
        : "agent_persona_logo.remove_attempted",
      target: `runtime:${runtimeIdentityId}`,
      details: {
        presentation: "persona_logo",
        operation: logo ? "replace" : "remove",
        ...(logo ? { contentType: logo.contentType, size: logo.size } : {}),
      },
    });
    try {
      const [rows] = await database.batch([update, audit] as const);
      return rows.length === 1 ? "updated" : "forbidden";
    } catch {
      return "unavailable";
    }
  }

  return {
    async resolveLogoPointer(personaKey: "titus" | "walter") {
      const rows = await database
        .select({
          runtimeIdentityId: personaAssignment.runtimeIdentityId,
          sha256: personaAssignment.logoSha256,
        })
        .from(personaAssignment)
        .innerJoin(
          runtimeIdentity,
          eq(runtimeIdentity.id, personaAssignment.runtimeIdentityId),
        )
        .innerJoin(useCase, eq(useCase.id, runtimeIdentity.useCaseId))
        .where(
          and(
            eq(personaAssignment.personaKey, personaKey),
            eq(personaAssignment.isDefault, true),
            eq(personaAssignment.status, "active"),
            eq(runtimeIdentity.status, "active"),
            eq(useCase.status, "active"),
          ),
        );
      return rows.length === 1 ? rows[0] : null;
    },
    replaceLogo(input: {
      actorUserId: string;
      runtimeIdentityId: string;
      logo: ValidAgentPersonaLogo;
    }) {
      return mutate(input);
    },
    removeLogo(input: { actorUserId: string; runtimeIdentityId: string }) {
      return mutate({ ...input, logo: null });
    },
    async readLogo({
      runtimeIdentityId,
      sha256,
    }: {
      runtimeIdentityId: string;
      sha256: string;
    }): Promise<{
      contentType: AgentPersonaLogoContentType;
      bytes: Uint8Array;
    } | null> {
      const rows = await database
        .select({
          contentType: personaAssignment.logoContentType,
          dataBase64: personaAssignment.logoDataBase64,
          sha256: personaAssignment.logoSha256,
        })
        .from(personaAssignment)
        .innerJoin(
          runtimeIdentity,
          eq(runtimeIdentity.id, personaAssignment.runtimeIdentityId),
        )
        .innerJoin(useCase, eq(useCase.id, runtimeIdentity.useCaseId))
        .where(
          and(
            eq(personaAssignment.runtimeIdentityId, runtimeIdentityId),
            eq(personaAssignment.logoSha256, sha256),
            eq(personaAssignment.isDefault, true),
            eq(personaAssignment.status, "active"),
            eq(runtimeIdentity.status, "active"),
            eq(useCase.status, "active"),
          ),
        );
      if (rows.length !== 1) return null;
      const row = rows[0];
      if (!row.contentType || !row.dataBase64 || !row.sha256) return null;
      const bytes = Uint8Array.from(Buffer.from(row.dataBase64, "base64"));
      const validated = validateAgentPersonaLogo({
        contentType: row.contentType,
        bytes,
      });
      return validated.ok && validated.value.sha256 === row.sha256
        ? { contentType: validated.value.contentType, bytes }
        : null;
    },
  };
}

export const agentPersonaPresentationStore =
  createAgentPersonaPresentationStore();
