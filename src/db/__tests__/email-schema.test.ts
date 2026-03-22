import { getTableColumns } from "drizzle-orm";
import {
  emailLog,
  emailTypeEnum,
  emailStatusEnum,
  user,
} from "@/db/schema";

describe("Email Schema", () => {
  describe("emailTypeEnum", () => {
    it("has all expected email types", () => {
      expect(emailTypeEnum.enumValues).toEqual([
        "verification",
        "password_reset",
        "welcome",
        "payment_failure",
        "provisioning",
      ]);
    });
  });

  describe("emailStatusEnum", () => {
    it("has sent and failed statuses", () => {
      expect(emailStatusEnum.enumValues).toEqual(["sent", "failed"]);
    });
  });

  describe("emailLog table", () => {
    it("has all required columns", () => {
      const columns = getTableColumns(emailLog);
      expect(columns).toHaveProperty("id");
      expect(columns).toHaveProperty("userId");
      expect(columns).toHaveProperty("recipientEmail");
      expect(columns).toHaveProperty("emailType");
      expect(columns).toHaveProperty("resendId");
      expect(columns).toHaveProperty("status");
      expect(columns).toHaveProperty("error");
      expect(columns).toHaveProperty("createdAt");
    });

    it("has recipientEmail as not null", () => {
      const columns = getTableColumns(emailLog);
      expect(columns.recipientEmail.notNull).toBe(true);
    });

    it("has emailType as not null", () => {
      const columns = getTableColumns(emailLog);
      expect(columns.emailType.notNull).toBe(true);
    });

    it("has status as not null", () => {
      const columns = getTableColumns(emailLog);
      expect(columns.status.notNull).toBe(true);
    });

    it("has serial id as primary key", () => {
      const columns = getTableColumns(emailLog);
      expect(columns.id.primary).toBe(true);
    });
  });

  describe("user.emailOptOut", () => {
    it("exists on user table", () => {
      const columns = getTableColumns(user);
      expect(columns).toHaveProperty("emailOptOut");
    });

    it("defaults to false", () => {
      const columns = getTableColumns(user);
      expect(columns.emailOptOut.hasDefault).toBe(true);
    });

    it("is not null", () => {
      const columns = getTableColumns(user);
      expect(columns.emailOptOut.notNull).toBe(true);
    });
  });
});
