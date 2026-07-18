import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// Deterministic test-only secret for helpers that intentionally fail closed
// when Better Auth is not configured. Never use this value outside Jest.
process.env.BETTER_AUTH_SECRET ??= "overnightdesk-jest-only-secret-at-least-32-bytes";
