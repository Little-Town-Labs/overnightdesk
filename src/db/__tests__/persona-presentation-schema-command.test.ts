const {
  classifySchema,
  loadStatements,
  parseCommand,
} = require("../../../scripts/apply-persona-presentation-schema.cjs");

const columns = ["logo_content_type", "logo_data_base64", "logo_sha256"];
const constraints = [
  "persona_assignment_logo_all_or_none",
  "persona_assignment_logo_content_type",
  "persona_assignment_logo_data_length",
  "persona_assignment_logo_sha256",
];

describe("persona presentation schema command", () => {
  it("classifies only exact absent or fully deployed states", () => {
    expect(
      classifySchema({ persona_assignment: true, columns: [], constraints: [] }),
    ).toBe("ready");
    expect(
      classifySchema({ persona_assignment: true, columns, constraints }),
    ).toBe("deployed");
    expect(() =>
      classifySchema({
        persona_assignment: true,
        columns: columns.slice(0, 1),
        constraints: [],
      }),
    ).toThrow("mixed_persona_presentation_schema_state");
    expect(() =>
      classifySchema({ persona_assignment: false, columns: [], constraints: [] }),
    ).toThrow("persona_assignment_table_unavailable");
  });

  it("accepts PostgreSQL text-array results returned by the Neon transport", () => {
    expect(
      classifySchema({
        persona_assignment: true,
        columns: "{}",
        constraints: "{}",
      }),
    ).toBe("ready");
    expect(
      classifySchema({
        persona_assignment: true,
        columns: `{${columns.join(",")}}`,
        constraints: `{${constraints.join(",")}}`,
      }),
    ).toBe("deployed");
  });

  it("accepts only plan/apply/verify and loads seven additive statements", () => {
    expect(parseCommand()).toBe("plan");
    expect(parseCommand("apply")).toBe("apply");
    expect(parseCommand("verify")).toBe("verify");
    expect(() => parseCommand("rollback")).toThrow("plan, apply, or verify");
    expect(loadStatements()).toHaveLength(7);
    expect(loadStatements().every((statement: string) => statement.startsWith("ALTER TABLE"))).toBe(true);
  });
});
