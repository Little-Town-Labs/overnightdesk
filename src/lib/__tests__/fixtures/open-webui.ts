import { MEMBERSHIP_RUNTIME_FIXTURES } from "@/lib/__tests__/fixtures/use-case-membership";
import type { OpenWebuiWorkspaceAssignment } from "@/lib/open-webui-auth-spike";

export const OPEN_WEBUI_TITUS_FIXTURE = {
  assignment: {
    enabled: true,
    deploymentId: "open-webui-hermes-titus",
    useCaseId: MEMBERSHIP_RUNTIME_FIXTURES.titus.assignment.useCaseId,
    runtimeIdentityId:
      MEMBERSHIP_RUNTIME_FIXTURES.titus.assignment.runtimeIdentityId,
    host: "titus-chat.overnightdesk.com",
    oidcClientId: "fixture-open-webui-titus-client",
    oidcAudience: "fixture-open-webui-titus-client",
    issuer: "https://www.overnightdesk.com/api/auth",
    hermesBaseUrl: "http://hermes-titus:8642/v1",
  } satisfies OpenWebuiWorkspaceAssignment,
  userId: MEMBERSHIP_RUNTIME_FIXTURES.titus.userId,
  unapprovedFrameOrigin: "https://attacker.example",
} as const;
