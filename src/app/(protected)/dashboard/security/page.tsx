import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/billing";
import { getEngineStatus } from "@/lib/engine-client";
import { getInstanceForUser } from "@/lib/instance";
import { ApprovalQueue } from "./approval-queue";
import { AuditPanel } from "./audit-panel";

export default async function SecurityPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  if (!isAdmin(session.user.email)) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
        <p className="text-red-400">Access denied. Admin only.</p>
      </div>
    );
  }

  const instance = await getInstanceForUser(session.user.id);
  const isRunning = instance?.status === "running" && instance.subdomain && instance.engineApiKey;

  let securityStatus: Record<string, unknown> | null = null;
  if (isRunning) {
    const engineStatus = await getEngineStatus(instance.subdomain!, instance.engineApiKey!);
    securityStatus = engineStatus
      ? (engineStatus as Record<string, unknown>).security as Record<string, unknown> ?? null
      : null;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-white">Security</h2>

      {/* Status Card */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-400">
          SecurityTeam Status
        </h3>
        {!isRunning ? (
          <p className="text-zinc-500">Instance not running. Start your instance to view security status.</p>
        ) : !securityStatus ? (
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-zinc-600" />
            <span className="text-zinc-400">Security screening not configured</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-zinc-500">Status</p>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    (securityStatus as Record<string, unknown>).reachable
                      ? "bg-green-500"
                      : "bg-red-500"
                  }`}
                />
                <span className="text-sm text-white">
                  {(securityStatus as Record<string, unknown>).reachable ? "Connected" : "Unreachable"}
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Circuit Breaker</p>
              <p className="mt-1 text-sm text-white">
                {String((securityStatus as Record<string, unknown>).circuit_breaker ?? "unknown")}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Configured</p>
              <p className="mt-1 text-sm text-white">
                {(securityStatus as Record<string, unknown>).configured ? "Yes" : "No"}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Last Check</p>
              <p className="mt-1 text-sm text-white">
                {(securityStatus as Record<string, unknown>).last_check
                  ? new Date(String((securityStatus as Record<string, unknown>).last_check)).toLocaleTimeString()
                  : "Never"}
              </p>
            </div>
          </div>
        )}

        {securityStatus && !(securityStatus as Record<string, unknown>).reachable && (
          <div className="mt-4 rounded-md bg-red-950/50 border border-red-800 p-3">
            <p className="text-sm text-red-300">
              Security service is temporarily unavailable. Outbound messages are being held (fail-closed).
              Inbound messages are proceeding without screening (fail-open).
            </p>
          </div>
        )}
      </div>

      {/* Approval Queue */}
      {isRunning && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-400">
            Approval Queue
          </h3>
          <ApprovalQueue />
        </div>
      )}

      {/* Audit Panel */}
      {isRunning && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-400">
            Security Audits
          </h3>
          <AuditPanel />
        </div>
      )}
    </div>
  );
}
