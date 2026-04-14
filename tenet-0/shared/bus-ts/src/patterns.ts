// patternKind classifies a subscription pattern for both in-memory matching
// and SQL LIKE translation. One parser prevents drift between the two.
export type PatternKind = "exact" | "prefix" | "suffix" | "all";

export interface ParsedPattern {
  kind: PatternKind;
  // For prefix: "ops." ; for suffix: ".failed" ; for exact: full pattern.
  literal: string;
}

export function parsePattern(p: string): ParsedPattern {
  if (p === "*") return { kind: "all", literal: "" };
  if (p.length >= 3 && p.endsWith(".*")) {
    return { kind: "prefix", literal: p.slice(0, -1) };
  }
  if (p.length >= 3 && p.startsWith("*.")) {
    return { kind: "suffix", literal: p.slice(1) };
  }
  return { kind: "exact", literal: p };
}

export function matchesPattern(p: ParsedPattern, eventType: string): boolean {
  switch (p.kind) {
    case "all":
      return true;
    case "prefix":
      return eventType.startsWith(p.literal);
    case "suffix":
      return eventType.endsWith(p.literal);
    case "exact":
      return eventType === p.literal;
  }
}

export function patternToLike(p: ParsedPattern): string {
  switch (p.kind) {
    case "all":
      return "%";
    case "prefix":
      return p.literal + "%";
    case "suffix":
      return "%" + p.literal;
    case "exact":
      return p.literal;
  }
}
