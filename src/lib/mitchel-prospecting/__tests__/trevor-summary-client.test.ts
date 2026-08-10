import { provisionerClient } from "@/lib/provisioner";
import { fetchMitchelProspectingSummary } from "../trevor-summary-client";
import { createUnavailableMitchelProspectingSummary } from "../summary";

jest.mock("@/lib/provisioner", () => ({
  provisionerClient: {
    getMitchelProspectingSummary: jest.fn(),
  },
}));

describe("fetchMitchelProspectingSummary", () => {
  it("preserves the read-only summary contract and rejects mutation-capable data", async () => {
    const unavailable = createUnavailableMitchelProspectingSummary();
    const getSummary = provisionerClient.getMitchelProspectingSummary as jest.Mock;
    getSummary.mockResolvedValueOnce({
      ...unavailable,
      outboundSent: true,
    });

    await expect(fetchMitchelProspectingSummary("hermes-mitchel")).resolves.toEqual(
      expect.objectContaining({
        tenantId: "hermes-mitchel",
        outboundSent: false,
        warnings: expect.arrayContaining([
          "Trevor prospecting data is not available right now.",
        ]),
      }),
    );
    expect(getSummary).toHaveBeenCalledWith("hermes-mitchel");
  });
});
