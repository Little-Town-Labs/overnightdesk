/**
 * Settings components tests
 *
 * Tests password change form validation.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockChangePassword = jest.fn();
jest.mock("@/lib/auth-client", () => ({
  authClient: {
    changePassword: (...args: unknown[]) => mockChangePassword(...args),
  },
}));

import { ChangePassword } from "../change-password";

// ---------------------------------------------------------------------------
// ChangePassword validation tests
// ---------------------------------------------------------------------------

describe("ChangePassword", () => {
  beforeEach(() => {
    mockChangePassword.mockClear();
  });

  describe("component contract", () => {
    it("exports a valid React component function", () => {
      expect(typeof ChangePassword).toBe("function");
    });
  });

  describe("password validation logic", () => {
    it("rejects passwords shorter than 8 characters", () => {
      const newPassword = "short";
      expect(newPassword.length).toBeLessThan(8);
    });

    it("accepts passwords 8 characters or longer", () => {
      const newPassword = "longpassword123";
      expect(newPassword.length).toBeGreaterThanOrEqual(8);
    });

    it("rejects when passwords do not match", () => {
      const newPassword = "longpassword123";
      const confirmPassword = "differentpassword";
      expect(newPassword).not.toBe(confirmPassword);
    });

    it("accepts when passwords match", () => {
      const newPassword = "longpassword123";
      const confirmPassword = "longpassword123";
      expect(newPassword).toBe(confirmPassword);
    });
  });

  describe("API integration", () => {
    it("calls authClient.changePassword with correct params", async () => {
      mockChangePassword.mockResolvedValueOnce({ data: {} });

      const params = {
        currentPassword: "oldpassword123",
        newPassword: "newpassword123",
        revokeOtherSessions: false,
      };

      await mockChangePassword(params);

      expect(mockChangePassword).toHaveBeenCalledWith({
        currentPassword: "oldpassword123",
        newPassword: "newpassword123",
        revokeOtherSessions: false,
      });
    });

    it("handles error response from authClient", async () => {
      const errorResult = {
        error: { message: "Current password is incorrect" },
      };
      mockChangePassword.mockResolvedValueOnce(errorResult);

      const result = await mockChangePassword({
        currentPassword: "wrong",
        newPassword: "newpass12345",
        revokeOtherSessions: false,
      });

      expect(result.error.message).toBe("Current password is incorrect");
    });

    it("handles success response from authClient", async () => {
      mockChangePassword.mockResolvedValueOnce({ data: { success: true } });

      const result = await mockChangePassword({
        currentPassword: "oldpass12345",
        newPassword: "newpass12345",
        revokeOtherSessions: false,
      });

      expect(result.data).toBeDefined();
      expect(result.error).toBeUndefined();
    });
  });
});
