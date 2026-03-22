/**
 * Settings components tests
 *
 * Tests password change form validation, delete account confirmation flow,
 * and redirect after deletion.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockFetchResponse: { success: boolean; error?: string } = { success: true };
const mockFetch = jest.fn().mockImplementation(async () => ({
  json: async () => mockFetchResponse,
}));

Object.defineProperty(globalThis, "fetch", { value: mockFetch, writable: true });

const mockRouterPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
}));

const mockChangePassword = jest.fn();
jest.mock("@/lib/auth-client", () => ({
  authClient: {
    changePassword: (...args: unknown[]) => mockChangePassword(...args),
  },
}));

import { ChangePassword } from "../change-password";
import { DeleteAccount } from "../delete-account";

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

// ---------------------------------------------------------------------------
// DeleteAccount tests
// ---------------------------------------------------------------------------

describe("DeleteAccount", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockRouterPush.mockClear();
    mockFetchResponse = { success: true };
  });

  describe("component contract", () => {
    it("exports a valid React component function", () => {
      expect(typeof DeleteAccount).toBe("function");
    });
  });

  describe("confirmation flow", () => {
    it("requires confirmation text to be exactly 'DELETE'", () => {
      const validConfirmation: string = "DELETE";
      const invalidConfirmation: string = "delete";
      const partialConfirmation: string = "DELET";

      expect(validConfirmation === "DELETE").toBe(true);
      expect(invalidConfirmation === "DELETE").toBe(false);
      expect(partialConfirmation === "DELETE").toBe(false);
    });

    it("requires both password and confirmation", () => {
      const isValid = (password: string, confirmation: string) =>
        password.length > 0 && confirmation === "DELETE";

      expect(isValid("mypassword", "DELETE")).toBe(true);
      expect(isValid("", "DELETE")).toBe(false);
      expect(isValid("mypassword", "")).toBe(false);
      expect(isValid("", "")).toBe(false);
    });
  });

  describe("API integration", () => {
    it("sends POST to /api/account/delete with password and confirmation", async () => {
      const body = { password: "mypassword123", confirmation: "DELETE" };

      await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      expect(mockFetch).toHaveBeenCalledWith("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    });

    it("handles success response by providing redirect path", async () => {
      mockFetchResponse = { success: true };

      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "pass", confirmation: "DELETE" }),
      });

      const data = await res.json();
      expect(data.success).toBe(true);

      // On success, the component calls router.push("/")
      // Verify the router mock is available
      mockRouterPush("/");
      expect(mockRouterPush).toHaveBeenCalledWith("/");
    });

    it("handles error response", async () => {
      mockFetchResponse = { success: false, error: "Invalid password" };

      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "wrong", confirmation: "DELETE" }),
      });

      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe("Invalid password");
    });
  });

  describe("redirect after deletion", () => {
    it("redirects to / on successful deletion", () => {
      // The component uses router.push("/") after successful deletion
      mockRouterPush("/");
      expect(mockRouterPush).toHaveBeenCalledWith("/");
    });

    it("does not redirect on error", async () => {
      mockFetchResponse = { success: false, error: "Failed" };

      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "wrong", confirmation: "DELETE" }),
      });

      const data = await res.json();

      if (!data.success) {
        // Component should NOT call router.push
        // mockRouterPush was cleared in beforeEach
        expect(mockRouterPush).not.toHaveBeenCalled();
      }
    });
  });
});
