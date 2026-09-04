import { describe, expect, it } from "vitest";

import { assertPracticeSurface } from "./verify-surface.mjs";

const safeSurface = {
  diagnostics: { errors: 0, warnings: 0 },
  model: "eve-mock/model",
  schedules: [],
  skills: [],
  status: "ready",
  subagents: [],
  tools: [],
};

describe("assertPracticeSurface", () => {
  it("accepts the ready deterministic agent with no active capabilities", () => {
    expect(assertPracticeSurface(safeSurface)).toEqual({
      model: "eve-mock/model",
      status: "ready",
    });
  });

  it.each(["tools", "skills", "subagents", "schedules"] as const)(
    "rejects a non-empty %s surface",
    (field) => {
      expect(() =>
        assertPracticeSurface({ ...safeSurface, [field]: ["unexpected"] }),
      ).toThrowError("Eve practice capability verification failed.");
    },
  );

  it("rejects a non-mock model", () => {
    expect(() =>
      assertPracticeSurface({ ...safeSurface, model: "chatgpt/model" }),
    ).toThrowError("Eve practice capability verification failed.");
  });
});
