import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { withHermesJwksFailureAudit } from "@/lib/hermes-oidc-audit";

export const dynamic = "force-dynamic";

const handlers = toNextJsHandler(auth);
const RETIRED_EMAIL_SIGNUP_PATH = "/api/auth/sign-up/email";

export const GET = (request: Request) =>
  withHermesJwksFailureAudit(request, () => handlers.GET(request));

export const POST = (request: Request) => {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
  if (pathname === RETIRED_EMAIL_SIGNUP_PATH) {
    return new Response(null, { status: 404 });
  }

  return handlers.POST(request);
};

export const { PATCH, PUT, DELETE } = handlers;
