import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getInstanceForUser, isHermesTenant } from "@/lib/instance";
import { ChangePassword } from "./change-password";
import { DeleteAccount } from "./delete-account";
import { AgentCredentials } from "./agent-credentials";

export default async function SettingsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  const inst = await getInstanceForUser(session.user.id);
  const showCredentials = isHermesTenant(inst) && inst?.status === "running";

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Profile</h2>
        <dl className="space-y-3">
          <div>
            <dt className="text-sm text-zinc-500">Name</dt>
            <dd className="text-white">{session.user.name}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500">Email</dt>
            <dd className="text-white">{session.user.email}</dd>
          </div>
        </dl>
      </div>

      {showCredentials && <AgentCredentials />}

      <ChangePassword />

      <DeleteAccount />
    </div>
  );
}
