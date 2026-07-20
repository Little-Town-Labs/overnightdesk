jest.mock("@/db", () => ({ db: {} }));

import { generateWalterIdentityIds } from "@/db/use-case-identity-backfill-store";
import { WALTER_IDENTITY_TEMPLATE } from "@/lib/use-case-identity-backfill";

describe("Walter identity backfill store", () => {
  it("generates an exact ID manifest for the guarded Walter foundation", () => {
    const ids = generateWalterIdentityIds();

    expect(ids.useCaseId).toBeTruthy();
    expect(ids.runtimeIdentityId).toBeTruthy();
    expect(ids.personaAssignmentId).toBeTruthy();
    expect(ids.membershipId).toBeTruthy();
    expect(ids.resourceBindingIds).toHaveLength(
      WALTER_IDENTITY_TEMPLATE.resourceBindings.length,
    );
    expect(ids.secretBoundaryBindingIds).toHaveLength(
      WALTER_IDENTITY_TEMPLATE.secretBoundaryBindings.length,
    );
    expect(new Set(Object.values(ids).flat())).toHaveProperty(
      "size",
      4 +
        WALTER_IDENTITY_TEMPLATE.resourceBindings.length +
        WALTER_IDENTITY_TEMPLATE.secretBoundaryBindings.length,
    );
  });
});
