import {
  resolveAgentDirectory,
  resolveAgentWorkspaceDirectory,
  selectAgentDirectoryEntry,
  selectAgentWorkspace,
  type AgentDirectoryStore,
  type AgentWorkspaceRecord,
} from "@/lib/open-webui-workspace";

const TITUS_RECORD: AgentWorkspaceRecord = {
  useCaseId: "11111111-1111-4111-8111-111111111111",
  runtimeIdentityId: "22222222-2222-4222-8222-222222222222",
  useCaseName: "Timeless Tech Solutions",
  personaKey: "titus",
  personaName: "Titus",
  deploymentId: "open-webui-hermes-titus",
  host: "titus-chat.overnightdesk.com",
};

const WALTER_RECORD: AgentWorkspaceRecord = {
  useCaseId: "33333333-3333-4333-8333-333333333333",
  runtimeIdentityId: "44444444-4444-4444-8444-444444444444",
  useCaseName: "OvernightDesk platform operations",
  personaKey: "walter",
  personaName: "Walter",
  deploymentId: "open-webui-hermes-walter",
  host: "walter-chat.overnightdesk.com",
};

function store(records: AgentWorkspaceRecord[]): AgentDirectoryStore {
  return { listAuthorizedAgents: jest.fn().mockResolvedValue(records) };
}

describe("agent workspace directory", () => {
  it("keeps the agent directory separate from optional Open Chat capability", async () => {
    const directoryStore = store([
      TITUS_RECORD,
      { ...WALTER_RECORD, deploymentId: null, host: null },
    ]);

    const directory = await resolveAgentDirectory(
      "gary-better-auth-id",
      directoryStore,
    );
    const chat = await resolveAgentWorkspaceDirectory(
      "gary-better-auth-id",
      directoryStore,
    );

    expect(directory).toEqual({
      status: "available",
      agents: [
        expect.objectContaining({ key: "titus", identity: expect.objectContaining({ name: "Titus" }) }),
        expect.objectContaining({ key: "walter", identity: expect.objectContaining({ name: "Walter" }) }),
      ],
    });
    expect(chat).toEqual({
      status: "available",
      workspaces: [expect.objectContaining({ key: "titus" })],
    });
  });

  it("builds identity and workspace presentation from an authorized deployed assignment", async () => {
    await expect(
      resolveAgentWorkspaceDirectory("gary-better-auth-id", store([TITUS_RECORD])),
    ).resolves.toEqual({
      status: "available",
      workspaces: [
        {
          key: "titus",
          identity: {
            name: "Titus",
            logo: {
              src: "/agents/titus-mark.svg",
              alt: "Titus agent mark",
            },
          },
          useCaseName: "Timeless Tech Solutions",
          workspaceUrl: "https://titus-chat.overnightdesk.com/",
          fallbackMessage:
            "Your existing Titus Matrix room and approved email channel remain available and independent of Open Chat.",
        },
      ],
    });
  });

  it("shows Gary both workspaces only when both are authorized and deployed", async () => {
    const result = await resolveAgentWorkspaceDirectory(
      "gary-better-auth-id",
      store([WALTER_RECORD, TITUS_RECORD]),
    );

    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("directory unavailable");
    expect(result.workspaces.map((workspace) => workspace.identity.name)).toEqual([
      "Titus",
      "Walter",
    ]);
  });

  it("shows Austin only Titus when that is his only authorized deployed workspace", async () => {
    const result = await resolveAgentWorkspaceDirectory(
      "austin-better-auth-id",
      store([TITUS_RECORD]),
    );

    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("directory unavailable");
    expect(result.workspaces.map((workspace) => workspace.identity.name)).toEqual([
      "Titus",
    ]);
  });

  it("fails closed when the directory cannot verify memberships and bindings", async () => {
    const unavailableStore: AgentDirectoryStore = {
      listAuthorizedAgents: jest
        .fn()
        .mockRejectedValue(new Error("database unavailable")),
    };

    await expect(
      resolveAgentWorkspaceDirectory("gary-better-auth-id", unavailableStore),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("rejects malformed or duplicate workspace assignments", async () => {
    await expect(
      resolveAgentWorkspaceDirectory(
        "gary-better-auth-id",
        store([
          { ...TITUS_RECORD, host: "attacker.example" },
          TITUS_RECORD,
          { ...TITUS_RECORD, deploymentId: "duplicate" },
        ]),
      ),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("selects only a workspace returned by the server directory", async () => {
    const result = await resolveAgentWorkspaceDirectory(
      "gary-better-auth-id",
      store([TITUS_RECORD, WALTER_RECORD]),
    );
    if (result.status !== "available") throw new Error("directory unavailable");

    expect(selectAgentWorkspace(result.workspaces, undefined)?.key).toBe("titus");
    expect(selectAgentWorkspace(result.workspaces, "walter")?.key).toBe("walter");
    expect(selectAgentWorkspace(result.workspaces, "hermes-walter")).toBeNull();
    expect(selectAgentWorkspace(result.workspaces, "https://attacker.example")).toBeNull();
  });

  it("selects only an agent returned by the membership-filtered directory", async () => {
    const result = await resolveAgentDirectory(
      "gary-better-auth-id",
      store([TITUS_RECORD, { ...WALTER_RECORD, deploymentId: null, host: null }]),
    );
    if (result.status !== "available") throw new Error("directory unavailable");

    expect(selectAgentDirectoryEntry(result.agents, undefined)?.key).toBe("titus");
    expect(selectAgentDirectoryEntry(result.agents, "walter")?.key).toBe("walter");
    expect(selectAgentDirectoryEntry(result.agents, "rex")).toBeNull();
  });
});
