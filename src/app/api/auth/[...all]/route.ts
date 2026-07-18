import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { withHermesJwksFailureAudit } from "@/lib/hermes-oidc-audit";

export const dynamic = "force-dynamic";

const handlers = toNextJsHandler(auth);

export const GET = (request: Request) =>
  withHermesJwksFailureAudit(request, () => handlers.GET(request));
export const { POST, PATCH, PUT, DELETE } = handlers;
