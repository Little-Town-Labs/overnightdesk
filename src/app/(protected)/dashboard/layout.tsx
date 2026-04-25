import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getInstanceForUser, isHermesTenant } from "@/lib/instance";
import { isAdmin, getSubscriptionForUser } from "@/lib/billing";
import { SignOutButton } from "./sign-out-button";
import { DashboardNav } from "./dashboard-nav";

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

  const [inst, userSubscription] = await Promise.all([
    getInstanceForUser(session.user.id),
    getSubscriptionForUser(session.user.id),
  ]);
  const instanceRunning = inst?.status === "running";
  const adminUser = isAdmin(session.user.email);
  const hermesAgent = isHermesTenant(inst);

  return (
    <div className="min-h-screen p-6 md:p-8" style={{ backgroundColor: "var(--color-od-base)" }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
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

        <DashboardNav instanceRunning={instanceRunning} isAdmin={adminUser} plan={userSubscription?.plan} isHermesTenant={hermesAgent} />

        {children}
      </div>
    </div>
  );
}
