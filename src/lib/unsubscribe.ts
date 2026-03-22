import { createHmac, timingSafeEqual } from "crypto";
import { getAppUrl } from "@/lib/config";

function getSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET environment variable is required");
  }
  return secret;
}

export function generateUnsubscribeToken(userId: string): string {
  const payload = `unsubscribe:${userId}`;
  const signature = createHmac("sha256", getSecret())
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}:${signature}`).toString("base64url");
}

export function verifyUnsubscribeToken(
  token: string
): { valid: true; userId: string } | { valid: false } {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length !== 3 || parts[0] !== "unsubscribe") {
      return { valid: false };
    }
    const userId = parts[1];
    const signature = parts[2];

    const expectedSignature = createHmac("sha256", getSecret())
      .update(`unsubscribe:${userId}`)
      .digest("hex");

    const sigBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      return { valid: false };
    }

    return { valid: true, userId };
  } catch {
    return { valid: false };
  }
}

export function getUnsubscribeUrl(userId: string): string {
  const baseUrl = getAppUrl();
  const token = generateUnsubscribeToken(userId);
  return `${baseUrl}/api/email/unsubscribe?token=${token}`;
}
