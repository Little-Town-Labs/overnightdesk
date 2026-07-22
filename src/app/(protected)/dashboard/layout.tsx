import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { instance } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveAgentDirectory } from "@/lib/open-webui-workspace";
import { isAdmin, getSubscriptionForUser } from "@/lib/billing";
import { SignOutButton } from "./sign-out-button";
import { DashboardNav } from "./dashboard-nav";
import { DashboardContent } from "./dashboard-content";
import { resolveDashboardNavigationState } from "./dashboard-navigation-state";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  const [instances, directory, userSubscription] = await Promise.all([
    db.select().from(instance).where(eq(instance.userId, session.user.id)),
    resolveAgentDirectory(session.user.id),
    getSubscriptionForUser(session.user.id),
  ]);
  const adminUser = isAdmin(session.user.email);
  const { instanceRunning, usesCanonicalAgentContext } =
    resolveDashboardNavigationState({
      directory:
        directory.status === "available"
          ? { status: "available", agentCount: directory.agents.length }
          : directory,
      instances,
    });

  return (
    <div className="min-h-screen p-3 sm:p-6 md:p-8" style={{ backgroundColor: "var(--color-od-base)" }}>
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)", color: "var(--color-od-text)" }}>
              OvernightDesk
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-od-text-2)" }}>
              {session.user.name}
            </p>
          </div>
          <SignOutButton />
        </div>

        <DashboardNav
          instanceRunning={instanceRunning}
          isAdmin={adminUser}
          plan={userSubscription?.plan}
          usesCanonicalAgentContext={usesCanonicalAgentContext}
        />

        <DashboardContent>{children}</DashboardContent>
      </div>
    </div>
  );
}
