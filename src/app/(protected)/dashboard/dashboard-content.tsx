"use client";

import { usePathname } from "next/navigation";

export function DashboardContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const workspaceLayout = pathname.startsWith("/dashboard/chat");

  return (
    <main
      className={
        workspaceLayout
          ? "mx-auto min-w-0 max-w-[1600px]"
          : "mx-auto min-w-0 max-w-4xl"
      }
    >
      {children}
    </main>
  );
}
