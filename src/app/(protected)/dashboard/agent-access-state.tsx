export type AgentAccessStateKind = "empty" | "unavailable";

const copy: Record<
  AgentAccessStateKind,
  { heading: string; detail: string }
> = {
  empty: {
    heading: "No active agent access",
    detail:
      "Your account does not currently have an active agent membership. Contact an administrator if you expected access.",
  },
  unavailable: {
    heading: "Agent access is temporarily unavailable",
    detail:
      "We could not verify your agent memberships. No agent controls are shown until access can be verified.",
  },
};

export function AgentAccessState({ state }: { state: AgentAccessStateKind }) {
  const content = copy[state];

  return (
    <section className="od-card p-6" role={state === "unavailable" ? "alert" : undefined}>
      <h2
        className="text-lg font-semibold"
        style={{ color: "var(--color-od-text)" }}
      >
        {content.heading}
      </h2>
      <p
        className="mt-2 max-w-2xl text-sm"
        style={{ color: "var(--color-od-text-2)" }}
      >
        {content.detail}
      </p>
    </section>
  );
}
