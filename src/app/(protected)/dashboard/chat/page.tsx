import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getInstanceForUser, isHermesTenant } from "@/lib/instance";
import { ChatInterface, type HermesSession } from "./chat-interface";

export default async function ChatPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  const inst = await getInstanceForUser(session.user.id);

  if (!inst || !isHermesTenant(inst)) {
    redirect("/dashboard");
  }

  // Fetch past sessions from the engine, forwarding the session cookie so the
  // API route can authenticate the request.
  let initialSessions: HermesSession[] = [];
  try {
    const reqHeaders = await headers();
    const cookie = reqHeaders.get("cookie") ?? "";

    const res = await fetch(
      `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/engine/sessions`,
      {
        headers: { cookie },
        cache: "no-store",
      }
    );

    if (res.ok) {
      const body = await res.json();
      // The route returns { sessions: [...] } or the array directly
      initialSessions = Array.isArray(body) ? body : (body.sessions ?? []);
    }
  } catch {
    // Non-fatal — degrade to empty sessions list
  }

  return (
    <ChatInterface
      instanceStatus={inst.status}
      agentName={inst.tenantId}
      initialSessions={initialSessions}
    />
  );
}
