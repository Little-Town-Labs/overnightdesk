// Typed errors returned by Bus and Governor. Callers branch with instanceof
// or via the static `code` on each subclass.

export class BusError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BusError";
    this.code = code;
  }
}

export class ErrUnauthenticated extends BusError {
  static readonly code = "unauthenticated";
  constructor() {
    super(ErrUnauthenticated.code, "bus: unauthenticated");
    this.name = "ErrUnauthenticated";
  }
}

export class ErrNamespaceViolation extends BusError {
  static readonly code = "namespace_violation";
  constructor() {
    super(ErrNamespaceViolation.code, "bus: namespace violation");
    this.name = "ErrNamespaceViolation";
  }
}

export class ErrConstitutionRejected extends BusError {
  static readonly code = "constitution_rejected";
  constructor(detail?: string) {
    super(
      ErrConstitutionRejected.code,
      detail
        ? `bus: constitution rejected: ${detail}`
        : "bus: constitution rejected",
    );
    this.name = "ErrConstitutionRejected";
  }
}

export class ErrCausalityLoop extends BusError {
  static readonly code = "causality_loop";
  constructor() {
    super(ErrCausalityLoop.code, "bus: causality loop");
    this.name = "ErrCausalityLoop";
  }
}

export class ErrNoConstitution extends BusError {
  static readonly code = "no_constitution";
  constructor() {
    super(ErrNoConstitution.code, "bus: no active constitution");
    this.name = "ErrNoConstitution";
  }
}

export class ErrBudgetBlocked extends BusError {
  static readonly code = "budget_blocked";
  constructor() {
    super(ErrBudgetBlocked.code, "bus: budget blocked");
    this.name = "ErrBudgetBlocked";
  }
}

export class ErrConnectionLost extends BusError {
  static readonly code = "connection_lost";
  constructor() {
    super(ErrConnectionLost.code, "bus: connection lost");
    this.name = "ErrConnectionLost";
  }
}
