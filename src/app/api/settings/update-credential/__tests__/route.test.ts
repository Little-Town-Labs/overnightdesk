const mockGetSession = jest.fn();
const mockWriteSecrets = jest.fn();

jest.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}));
jest.mock("@/lib/provisioner", () => ({
  provisionerClient: { writeSecrets: (...args: unknown[]) => mockWriteSecrets(...args) },
}));

import { NextRequest } from "next/server";
import { POST } from "../route";

describe("POST /api/settings/update-credential", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockWriteSecrets.mockReset();
  });

  it("requires authentication without processing the legacy payload", async () => {
    mockGetSession.mockResolvedValue(null);
    const response = await POST(
      new NextRequest("https://www.overnightdesk.com/api/settings/update-credential", {
        method: "POST",
        body: JSON.stringify({ secrets: { ARBITRARY_KEY: "secret" } }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(401);
    expect(mockWriteSecrets).not.toHaveBeenCalled();
  });

  it("rejects the legacy arbitrary secret-map contract with zero writes", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "owner-id", email: "owner@example.test" } });
    const response = await POST(
      new NextRequest("https://www.overnightdesk.com/api/settings/update-credential", {
        method: "POST",
        body: JSON.stringify({
          secrets: {
            OPENROUTER_API_KEY: "secret",
            ARBITRARY_KEY: "must-never-write",
          },
        }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "ENDPOINT_RETIRED",
        message: "Use the selected-agent managed variable endpoint.",
      },
    });
    expect(mockWriteSecrets).not.toHaveBeenCalled();
  });
});
