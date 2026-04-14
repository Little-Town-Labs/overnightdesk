// Status strings returned by stored procedures. Centralized to prevent typos
// in switch statements from silently masking SP behavior.

export const spStatus = {
  ok: "ok",
  rejectedUnauthenticated: "rejected_unauthenticated",
  rejectedNamespace: "rejected_namespace",
  rejectedConstitution: "rejected_constitution",
  rejectedCausality: "rejected_causality",
  rejectedNoConstitution: "rejected_no_constitution",
} as const;

export const budgetStatus = {
  ok: "ok",
  warning: "warning",
  blocked: "blocked",
  unauthenticated: "unauthenticated",
} as const;
