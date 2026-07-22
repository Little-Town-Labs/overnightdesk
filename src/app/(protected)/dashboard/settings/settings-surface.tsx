import type { ReactNode } from "react";
import {
  AgentAccessState,
  type AgentAccessStateKind,
} from "../agent-access-state";

interface AccountSettingsProps {
  accountSecurity: ReactNode;
  dangerZone: ReactNode;
  email: string;
  name: string;
}

type SettingsSurfaceProps = AccountSettingsProps &
  (
    | { agentContent: ReactNode; agentState?: never }
    | { agentContent?: never; agentState: AgentAccessStateKind }
  );

export function SettingsSurface(props: SettingsSurfaceProps) {
  return (
    <div className="space-y-10">
      <section aria-labelledby="account-settings-heading" className="space-y-4">
        <div>
          <p
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: "var(--color-od-accent)", fontFamily: "var(--font-mono)" }}
          >
            Global scope
          </p>
          <h1
            className="mt-1 text-2xl font-bold"
            id="account-settings-heading"
            style={{ color: "var(--color-od-text)", fontFamily: "var(--font-display)" }}
          >
            Account-wide settings
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-od-text-2)" }}>
            These controls apply to your OvernightDesk account and do not change when you select an agent.
          </p>
        </div>

        <div className="od-card p-5 sm:p-6">
          <h2 className="text-lg font-semibold" style={{ color: "var(--color-od-text)" }}>
            Profile
          </h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs" style={{ color: "var(--color-od-text-3)" }}>Name</dt>
              <dd className="mt-1 text-sm" style={{ color: "var(--color-od-text)" }}>{props.name}</dd>
            </div>
            <div>
              <dt className="text-xs" style={{ color: "var(--color-od-text-3)" }}>Email</dt>
              <dd className="mt-1 break-all text-sm" style={{ color: "var(--color-od-text)" }}>{props.email}</dd>
            </div>
          </dl>
        </div>

        {props.accountSecurity}
        {props.dangerZone}
      </section>

      <section aria-labelledby="agent-settings-heading" className="space-y-4">
        <div>
          <p
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: "var(--color-od-accent)", fontFamily: "var(--font-mono)" }}
          >
            Selected-agent scope
          </p>
          <h2
            className="mt-1 text-2xl font-bold"
            id="agent-settings-heading"
            style={{ color: "var(--color-od-text)", fontFamily: "var(--font-display)" }}
          >
            Agent settings
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--color-od-text-2)" }}>
            Identity and configuration below belong only to the selected authorized agent.
          </p>
        </div>

        {"agentContent" in props ? (
          props.agentContent
        ) : (
          <AgentAccessState state={props.agentState} />
        )}
      </section>
    </div>
  );
}
