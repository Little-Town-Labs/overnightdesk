import {
  getCanonicalServiceOrigin,
  getAppUrl,
  getBetterAuthUrl,
} from "@/lib/config";

describe("canonical service origins", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("trims surrounding whitespace and returns an origin-only URL", () => {
    expect(
      getCanonicalServiceOrigin("https://www.overnightdesk.com\n", "TEST_URL")
    ).toBe("https://www.overnightdesk.com");
  });

  it.each([
    "https://www.overnightdesk.com/n",
    "https://user@www.overnightdesk.com",
    "https://www.overnightdesk.com?next=/dashboard",
    "https://www.overnightdesk.com#fragment",
    "http://www.overnightdesk.com",
  ])("rejects a non-canonical public service URL: %s", (value) => {
    expect(() => getCanonicalServiceOrigin(value, "TEST_URL")).toThrow(
      "TEST_URL"
    );
  });

  it("allows HTTP only for local development origins", () => {
    expect(getCanonicalServiceOrigin("http://localhost:3000", "TEST_URL")).toBe(
      "http://localhost:3000"
    );
  });

  it("canonicalizes the public app and Better Auth environment URLs", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.overnightdesk.com\n";
    process.env.BETTER_AUTH_URL = "https://www.overnightdesk.com\n";

    expect(getAppUrl()).toBe("https://www.overnightdesk.com");
    expect(getBetterAuthUrl()).toBe("https://www.overnightdesk.com");
  });
});
