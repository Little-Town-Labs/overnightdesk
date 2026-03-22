import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignOutButton } from "./sign-out-button";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-zinc-400">
              Welcome back, {session.user.name}
            </p>
          </div>
          <SignOutButton />
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Account Info</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-zinc-500">Name</dt>
              <dd className="text-white">{session.user.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-500">Email</dt>
              <dd className="text-white">{session.user.email}</dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-500">Email Verified</dt>
              <dd className="text-white">
                {session.user.emailVerified ? "Yes" : "No"}
              </dd>
            </div>
          </dl>
        </div>

        <p className="mt-6 text-zinc-500 text-sm text-center">
          More dashboard features coming soon — subscription management, instance status, and settings.
        </p>
      </div>
    </div>
  );
}
