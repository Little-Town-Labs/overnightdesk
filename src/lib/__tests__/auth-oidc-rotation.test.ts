import {
  HERMES_JWT_OPTIONS,
  HERMES_OAUTH_PROVIDER_OPTIONS,
} from "@/lib/hermes-oidc-config";

describe("Hermes OIDC signing-key overlap", () => {
  it("keeps an old verification key longer than every issued artifact", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-18T07:00:00Z"));

    const nowSeconds = Math.floor(Date.now() / 1000);
    const rotatedAt =
      nowSeconds + (HERMES_JWT_OPTIONS.jwks?.rotationInterval ?? 0);
    const oldKeyRemovedAt =
      rotatedAt + (HERMES_JWT_OPTIONS.jwks?.gracePeriod ?? 0);
    const lastOldTokenExpiresAt =
      rotatedAt + (HERMES_OAUTH_PROVIDER_OPTIONS.idTokenExpiresIn ?? 0);
    const lastOldCodeExpiresAt =
      rotatedAt + (HERMES_OAUTH_PROVIDER_OPTIONS.codeExpiresIn ?? 0);

    expect(oldKeyRemovedAt).toBeGreaterThan(lastOldTokenExpiresAt);
    expect(oldKeyRemovedAt).toBeGreaterThan(lastOldCodeExpiresAt);

    jest.useRealTimers();
  });
});
