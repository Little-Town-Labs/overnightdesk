const mockWhere = jest.fn();
const mockFrom = jest.fn(() => ({ where: mockWhere }));
const mockSelect = jest.fn(() => ({ from: mockFrom }));

jest.mock("@/db", () => ({
  db: { select: mockSelect },
}));

jest.mock("@/db/schema", () => ({
  instance: { userId: "user_id" },
}));

import { getInstanceForUser, isHermesMitchelTenant } from "@/lib/instance";

describe("retained instance readers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reads the existing instance for an authenticated user", async () => {
    const instance = { id: "instance-1", tenantId: "hermes-titus" };
    mockWhere.mockResolvedValueOnce([instance]);

    await expect(getInstanceForUser("owner-reader-test")).resolves.toEqual(
      instance,
    );
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockWhere).toHaveBeenCalledTimes(1);
  });

  it("retains the Mitchel tenant discriminator used by the dashboard", () => {
    expect(
      isHermesMitchelTenant({
        tenantId: "hermes-mitchel",
        containerId: null,
      }),
    ).toBe(true);
  });
});
