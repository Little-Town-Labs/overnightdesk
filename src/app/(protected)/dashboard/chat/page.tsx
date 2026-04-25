import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getInstanceForUser, isHermesTenant } from "@/lib/instance";
import { ChatInterface } from "./chat-interface";

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

  return (
    <ChatInterface
      instanceStatus={inst.status}
      agentName={inst.tenantId}
    />
  );
}
