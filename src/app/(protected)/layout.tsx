import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireSubscription } from "@/lib/billing";

export default async function ProtectedLayout({
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

  const billing = await requireSubscription(
    session.user.id,
    session.user.email
  );

  if (!billing.allowed) {
    redirect("/pricing");
  }

  return <>{children}</>;
}
