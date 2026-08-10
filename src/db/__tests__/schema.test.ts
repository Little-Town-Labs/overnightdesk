import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../schema";

/**
 * Schema export tests — verify all tables and enums are defined.
 * These tests run without a database connection (type/structure checks only).
 */
describe("schema exports", () => {
  describe("enums", () => {
    it("exports instanceStatusEnum", () => {
      expect(schema.instanceStatusEnum).toBeDefined();
      expect(schema.instanceStatusEnum.enumValues).toEqual(
        expect.arrayContaining([
          "queued",
          "provisioning",
          "awaiting_auth",
          "running",
          "stopped",
          "error",
          "deprovisioned",
        ])
      );
    });

    it("exports claudeAuthStatusEnum", () => {
      expect(schema.claudeAuthStatusEnum).toBeDefined();
      expect(schema.claudeAuthStatusEnum.enumValues).toEqual(
        expect.arrayContaining(["not_configured", "connected", "expired"])
      );
    });

    it("does not export retired subscription enums", () => {
      expect(schema).not.toHaveProperty("subscriptionStatusEnum");
      expect(schema).not.toHaveProperty("subscriptionPlanEnum");
    });
  });

  describe("Better Auth tables", () => {
    it("exports user table", () => {
      expect(schema.user).toBeDefined();
    });

    it("exports session table", () => {
      expect(schema.session).toBeDefined();
    });

    it("exports account table", () => {
      expect(schema.account).toBeDefined();
    });

    it("exports verification table", () => {
      expect(schema.verification).toBeDefined();
    });
  });

  describe("platform tables", () => {
    it("does not export the retired subscription model or wizard state", () => {
      expect(schema).not.toHaveProperty("subscription");
      expect(schema).not.toHaveProperty("subscriptionRelations");
      expect(
        getTableConfig(schema.instance).columns.map((column) => column.name),
      ).not.toContain("wizard_state");
    });

    it("exports instance table", () => {
      expect(schema.instance).toBeDefined();
    });

    it("exports fleetEvent table", () => {
      expect(schema.fleetEvent).toBeDefined();
    });

    it("exports usageMetric table", () => {
      expect(schema.usageMetric).toBeDefined();
    });

    it("exports platformAuditLog table", () => {
      expect(schema.platformAuditLog).toBeDefined();
    });
  });

  describe("existing tables preserved", () => {
    it("still exports waitlist table", () => {
      expect(schema.waitlist).toBeDefined();
    });
  });
});
