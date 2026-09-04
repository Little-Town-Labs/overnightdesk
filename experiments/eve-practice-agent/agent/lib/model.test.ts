import { describe, expect, it } from "vitest";

import { resolvePracticeModelMode } from "./model.js";

describe("resolvePracticeModelMode", () => {
  it("defaults to the ChatGPT subscription model", () => {
    expect(resolvePracticeModelMode(undefined)).toBe("chatgpt");
  });

  it("accepts the explicit deterministic mock mode", () => {
    expect(resolvePracticeModelMode("mock")).toBe("mock");
  });

  it("accepts an explicit ChatGPT subscription mode", () => {
    expect(resolvePracticeModelMode("chatgpt")).toBe("chatgpt");
  });

  it("rejects unknown modes without echoing the supplied value", () => {
    expect(() => resolvePracticeModelMode("secret-like-value")).toThrowError(
      "EVE_PRACTICE_MODEL must be either chatgpt or mock.",
    );
  });
});
