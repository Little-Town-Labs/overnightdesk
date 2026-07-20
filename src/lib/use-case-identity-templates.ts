export interface CanonicalIdentityTemplate {
  number: number;
  useCase: {
    slug: string;
    displayName: string;
    status: "planned" | "active" | "suspended" | "retired";
  };
  runtime: {
    slug: string;
    memoryBoundaryKind: string;
    status: "planned" | "active" | "suspended" | "retired";
  };
  persona: {
    personaKey: string;
    displayName: string;
    isDefault: boolean;
    authorityProfile: string;
    status: "active" | "disabled" | "retired";
  };
  resourceBindings: ReadonlyArray<
    {
      provider: string;
      kind:
        | "platform_instance"
        | "orchestrator_tenant"
        | "container"
        | "volume"
        | "hostname"
        | "phase_path"
        | "oidc_client"
        | "intake_route";
      value: string;
      state: "active" | "compatibility" | "rollback" | "retired";
    }
  >;
  secretBoundaryBindings: ReadonlyArray<
    {
      phaseApp: string;
      environment: string;
      pathIdentifier: string;
    }
  >;
}

export const MITCHEL_TREVOR_IDENTITY_TEMPLATE = {
  number: 1,
  useCase: {
    slug: "mitchel-business",
    displayName: "Mitchel business workflows",
    status: "active" as const,
  },
  runtime: {
    slug: "hermes-mitchel",
    memoryBoundaryKind: "docker_named_volume",
    status: "active" as const,
  },
  persona: {
    personaKey: "trevor",
    displayName: "Trevor",
    isDefault: true,
    authorityProfile: "current-hermes-mitchel",
    status: "active" as const,
  },
  resourceBindings: [
    {
      provider: "docker",
      kind: "container" as const,
      value: "hermes-mitchel",
      state: "active" as const,
    },
    {
      provider: "docker",
      kind: "volume" as const,
      value: "hermes-mitchel-data",
      state: "active" as const,
    },
    {
      provider: "nginx",
      kind: "hostname" as const,
      value: "aero-fett.overnightdesk.com",
      state: "active" as const,
    },
    {
      provider: "phase",
      kind: "phase_path" as const,
      value: "/agents/hermes-email-intake/mitchel",
      state: "active" as const,
    },
  ],
  secretBoundaryBindings: [
    {
      phaseApp: "overnightdesk",
      environment: "production",
      pathIdentifier: "/agents/hermes-email-intake/mitchel",
    },
  ],
} as const satisfies CanonicalIdentityTemplate;

export const WALTER_IDENTITY_TEMPLATE = {
  number: 0,
  useCase: {
    slug: "overnightdesk-platform-operations",
    displayName: "OvernightDesk and Aegis platform operations",
    status: "active" as const,
  },
  runtime: {
    slug: "hermes-walter",
    memoryBoundaryKind: "docker_named_volume",
    status: "active" as const,
  },
  persona: {
    personaKey: "walter",
    displayName: "Walter",
    isDefault: true,
    authorityProfile: "current-hermes-walter",
    status: "active" as const,
  },
  resourceBindings: [
    {
      provider: "docker",
      kind: "container" as const,
      value: "hermes-walter",
      state: "active" as const,
    },
    {
      provider: "docker",
      kind: "container" as const,
      value: "hermes-agent",
      state: "rollback" as const,
    },
    {
      provider: "docker",
      kind: "volume" as const,
      value: "hermes-agent-data",
      state: "compatibility" as const,
    },
    {
      provider: "nginx",
      kind: "hostname" as const,
      value: "aegis-prod.overnightdesk.com",
      state: "active" as const,
    },
    {
      provider: "overnightdesk",
      kind: "platform_instance" as const,
      value: "tenant-0",
      state: "compatibility" as const,
    },
    {
      provider: "phase",
      kind: "phase_path" as const,
      value: "/agents/hermes-email-intake/walter",
      state: "active" as const,
    },
    {
      provider: "phase",
      kind: "phase_path" as const,
      value: "/agents/hermes-email-intake/agent",
      state: "rollback" as const,
    },
    {
      provider: "securityteam",
      kind: "intake_route" as const,
      value: "walter",
      state: "active" as const,
    },
    {
      provider: "securityteam",
      kind: "intake_route" as const,
      value: "agent",
      state: "rollback" as const,
    },
  ],
  secretBoundaryBindings: [
    {
      phaseApp: "overnightdesk",
      environment: "production",
      pathIdentifier: "/agents/hermes-email-intake/walter",
    },
  ],
} as const satisfies CanonicalIdentityTemplate;

export const TITUS_IDENTITY_TEMPLATE = {
  number: 2,
  useCase: {
    slug: "timeless-tech-solutions",
    displayName: "Timeless Tech Solutions operations and collaboration",
    status: "active" as const,
  },
  runtime: {
    slug: "hermes-titus",
    memoryBoundaryKind: "docker_named_volume",
    status: "active" as const,
  },
  persona: {
    personaKey: "titus",
    displayName: "Titus",
    isDefault: true,
    authorityProfile: "current-hermes-titus",
    status: "active" as const,
  },
  resourceBindings: [
    {
      provider: "docker",
      kind: "container" as const,
      value: "hermes-titus",
      state: "active" as const,
    },
    {
      provider: "docker",
      kind: "volume" as const,
      value: "hermes-titus-data",
      state: "active" as const,
    },
    ...[
      "/agents/hermes-titus/runtime",
      "/agents/hermes-titus/overnightdesk",
      "/agents/hermes-titus/memory",
    ].map((value) => ({
      provider: "phase",
      kind: "phase_path" as const,
      value,
      state: "active" as const,
    })),
    {
      provider: "phase",
      kind: "phase_path" as const,
      value: "/agents/hermes-titus/email",
      state: "rollback" as const,
    },
    {
      provider: "phase",
      kind: "phase_path" as const,
      value: "/agents/hermes-titus/matrix",
      state: "active" as const,
    },
    {
      provider: "phase",
      kind: "phase_path" as const,
      value: "/agents/hermes-titus/teams",
      state: "compatibility" as const,
    },
    {
      provider: "phase",
      kind: "phase_path" as const,
      value: "/agents/hermes-email-intake/titus",
      state: "active" as const,
    },
    {
      provider: "securityteam",
      kind: "intake_route" as const,
      value: "titus",
      state: "active" as const,
    },
  ],
  secretBoundaryBindings: [
    "/agents/hermes-titus/runtime",
    "/agents/hermes-titus/overnightdesk",
    "/agents/hermes-titus/memory",
    "/agents/hermes-titus/email",
    "/agents/hermes-titus/matrix",
    "/agents/hermes-titus/teams",
    "/agents/hermes-email-intake/titus",
  ].map((pathIdentifier) => ({
    phaseApp: "timeless-tech-solutions",
    environment: "production",
    pathIdentifier,
  })),
} as const satisfies CanonicalIdentityTemplate;
