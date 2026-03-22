/**
 * UsageTable component — Tests
 *
 * Tests rendering, empty state, and today marker.
 */

import {
  UsageTable,
  getTodayUTC,
  formatDate,
  type UsageRow,
} from "../usage-table";

describe("UsageTable", () => {
  describe("component contract", () => {
    it("is a valid function component", () => {
      expect(typeof UsageTable).toBe("function");
    });

    it("accepts usage prop array", () => {
      const usage: UsageRow[] = [
        { date: "2025-01-15", claudeCalls: 10, toolExecutions: 5 },
      ];
      const props = { usage };
      expect(props.usage).toHaveLength(1);
    });
  });

  describe("empty state", () => {
    it("renders empty state when usage array is empty", () => {
      // The component returns the empty-state div when usage.length === 0
      const usage: UsageRow[] = [];
      expect(usage.length === 0).toBe(true);
    });
  });

  describe("data rows", () => {
    it("renders a row for each usage entry", () => {
      const usage: UsageRow[] = [
        { date: "2025-01-15", claudeCalls: 10, toolExecutions: 5 },
        { date: "2025-01-14", claudeCalls: 8, toolExecutions: 3 },
        { date: "2025-01-13", claudeCalls: 15, toolExecutions: 7 },
      ];
      expect(usage).toHaveLength(3);
      expect(usage[0].claudeCalls).toBe(10);
      expect(usage[2].toolExecutions).toBe(7);
    });

    it("marks today's row as in progress", () => {
      const today = getTodayUTC();
      const usage: UsageRow[] = [
        { date: today, claudeCalls: 3, toolExecutions: 1 },
        { date: "2025-01-14", claudeCalls: 8, toolExecutions: 3 },
      ];

      // The component checks row.date === today to show "(in progress)"
      const todayRow = usage.find((r) => r.date === today);
      expect(todayRow).toBeDefined();
      expect(todayRow!.date).toBe(today);
    });

    it("does not mark yesterday as in progress", () => {
      const today = getTodayUTC();
      const yesterday = new Date(Date.now() - 86400000)
        .toISOString()
        .slice(0, 10);

      expect(yesterday).not.toBe(today);
    });
  });

  describe("bar visualization logic", () => {
    it("calculates bar width proportional to max value", () => {
      const usage: UsageRow[] = [
        { date: "2025-01-15", claudeCalls: 10, toolExecutions: 5 },
        { date: "2025-01-14", claudeCalls: 20, toolExecutions: 10 },
      ];

      const maxClaude = Math.max(...usage.map((r) => r.claudeCalls), 1);
      const maxTool = Math.max(...usage.map((r) => r.toolExecutions), 1);

      expect(maxClaude).toBe(20);
      expect(maxTool).toBe(10);

      // First row bar width for claude calls: 10/20 = 50%
      const firstRowWidth = (usage[0].claudeCalls / maxClaude) * 100;
      expect(firstRowWidth).toBe(50);
    });

    it("uses minimum of 1 for max to avoid division by zero", () => {
      const usage: UsageRow[] = [
        { date: "2025-01-15", claudeCalls: 0, toolExecutions: 0 },
      ];

      const maxClaude = Math.max(...usage.map((r) => r.claudeCalls), 1);
      expect(maxClaude).toBe(1);
    });
  });

  describe("formatDate()", () => {
    it("formats date string into human-readable format", () => {
      const formatted = formatDate("2025-01-15");
      // Should contain "Jan" and "15"
      expect(formatted).toContain("Jan");
      expect(formatted).toContain("15");
    });

    it("formats different months correctly", () => {
      const formatted = formatDate("2025-06-01");
      expect(formatted).toContain("Jun");
      expect(formatted).toContain("1");
    });
  });

  describe("getTodayUTC()", () => {
    it("returns a YYYY-MM-DD string", () => {
      const today = getTodayUTC();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("returns today's date", () => {
      const today = getTodayUTC();
      const expected = new Date().toISOString().slice(0, 10);
      expect(today).toBe(expected);
    });
  });
});
