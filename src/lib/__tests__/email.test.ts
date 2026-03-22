// Mock resend before importing email module
jest.mock("resend", () => {
  const mockSend = jest.fn();
  return {
    Resend: jest.fn().mockImplementation(() => ({
      emails: { send: mockSend },
    })),
    __mockSend: mockSend,
  };
});

// Mock react-email render to avoid ESM dynamic import issues in Jest
jest.mock("@react-email/components", () => ({
  render: jest.fn().mockResolvedValue("<html>rendered</html>"),
  Body: "Body",
  Container: "Container",
  Head: "Head",
  Html: "Html",
  Preview: "Preview",
  Section: "Section",
  Text: "Text",
  Hr: "Hr",
  Button: "Button",
  Link: "Link",
}));

// Mock database
jest.mock("@/db", () => ({
  db: {
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 1 }]),
      }),
    }),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    }),
  },
}));

jest.mock("@/db/schema", () => ({
  emailLog: { id: "id", userId: "user_id", recipientEmail: "recipient_email", emailType: "email_type", resendId: "resend_id", status: "status", error: "error", createdAt: "created_at" },
  user: { id: "id", emailOptOut: "email_opt_out" },
  emailTypeEnum: { enumValues: ["verification", "password_reset", "welcome", "payment_failure", "provisioning"] },
  emailStatusEnum: { enumValues: ["sent", "failed"] },
}));

// Get mock reference
const { __mockSend: mockSend } = jest.requireMock("resend");

import {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPaymentFailureEmail,
  sendProvisioningEmail,
} from "@/lib/email";

describe("Email Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({ data: { id: "msg_123" }, error: null });
  });

  describe("sendEmail()", () => {
    it("calls Resend API with correct parameters", async () => {
      const result = await sendEmail({
        to: "test@example.com",
        subject: "Test Email",
        html: "<p>Test</p>",
        text: "Test",
        emailType: "verification" as const,
        userId: "user_1",
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "test@example.com",
          subject: "Test Email",
          html: "<p>Test</p>",
          text: "Test",
        })
      );
      expect(result.success).toBe(true);
      expect(result.messageId).toBe("msg_123");
    });

    it("retries on failure up to 3 times", async () => {
      mockSend
        .mockResolvedValueOnce({ data: null, error: { message: "Rate limited" } })
        .mockResolvedValueOnce({ data: null, error: { message: "Rate limited" } })
        .mockResolvedValueOnce({ data: { id: "msg_456" }, error: null });

      const result = await sendEmail({
        to: "test@example.com",
        subject: "Test",
        html: "<p>Test</p>",
        emailType: "verification" as const,
      });

      expect(mockSend).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
    });

    it("returns failure after all retries exhausted", async () => {
      mockSend.mockResolvedValue({ data: null, error: { message: "Service down" } });

      const result = await sendEmail({
        to: "test@example.com",
        subject: "Test",
        html: "<p>Test</p>",
        emailType: "verification" as const,
      });

      expect(mockSend).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Service down");
    });

    it("logs successful email to database", async () => {
      const { db } = jest.requireMock("@/db");

      await sendEmail({
        to: "test@example.com",
        subject: "Test",
        html: "<p>Test</p>",
        emailType: "verification" as const,
        userId: "user_1",
      });

      expect(db.insert).toHaveBeenCalled();
    });

    it("logs failed email to database with error", async () => {
      mockSend.mockResolvedValue({ data: null, error: { message: "Failed" } });
      const { db } = jest.requireMock("@/db");

      await sendEmail({
        to: "test@example.com",
        subject: "Test",
        html: "<p>Test</p>",
        emailType: "verification" as const,
      });

      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe("sendVerificationEmail()", () => {
    it("sends email with verification subject and URL", async () => {
      await sendVerificationEmail(
        { email: "user@example.com", name: "Test User" },
        "https://example.com/verify?token=abc"
      );

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "user@example.com",
          subject: expect.stringContaining("erif"),
        })
      );
    });
  });

  describe("sendPasswordResetEmail()", () => {
    it("sends email with reset subject and URL", async () => {
      await sendPasswordResetEmail(
        { email: "user@example.com", name: "Test User" },
        "https://example.com/reset?token=abc"
      );

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "user@example.com",
          subject: expect.stringContaining("assword"),
        })
      );
    });
  });

  describe("sendWelcomeEmail()", () => {
    it("sends welcome email for regular users", async () => {
      await sendWelcomeEmail({
        user: { email: "user@example.com", name: "Test User", id: "user_1" },
        isWaitlistConvert: false,
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "user@example.com",
          subject: expect.stringContaining("elcome"),
        })
      );
    });

    it("skips sending if user has opted out", async () => {
      const { db } = jest.requireMock("@/db");
      db.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ emailOptOut: true }]),
        }),
      });

      await sendWelcomeEmail({
        user: { email: "user@example.com", name: "Test User", id: "user_1" },
        isWaitlistConvert: false,
      });

      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("sendPaymentFailureEmail()", () => {
    it("sends payment failure email with amount and portal URL", async () => {
      await sendPaymentFailureEmail({
        user: { email: "user@example.com", name: "Test User", id: "user_1" },
        amount: "$29.00",
        portalUrl: "https://billing.stripe.com/session/xxx",
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "user@example.com",
          subject: expect.stringContaining("ayment"),
        })
      );
    });

    it("skips duplicate payment failure within 24 hours", async () => {
      const { db } = jest.requireMock("@/db");
      db.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ id: 1 }]), // Recent email exists
        }),
      });

      await sendPaymentFailureEmail({
        user: { email: "user@example.com", name: "Test User", id: "user_1" },
        amount: "$29.00",
        portalUrl: "https://billing.stripe.com/session/xxx",
      });

      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("sendProvisioningEmail()", () => {
    it("sends provisioning email with dashboard URL", async () => {
      await sendProvisioningEmail({
        user: { email: "user@example.com", name: "Test User", id: "user_1" },
        dashboardUrl: "https://overnightdesk.com/dashboard",
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "user@example.com",
          subject: expect.stringContaining("eady"),
        })
      );
    });

    it("skips sending if user has opted out", async () => {
      const { db } = jest.requireMock("@/db");
      db.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ emailOptOut: true }]),
        }),
      });

      await sendProvisioningEmail({
        user: { email: "user@example.com", name: "Test User", id: "user_1" },
        dashboardUrl: "https://overnightdesk.com/dashboard",
      });

      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
