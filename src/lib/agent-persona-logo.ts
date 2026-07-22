import { createHash } from "node:crypto";
import { z } from "zod";

export const AGENT_PERSONA_LOGO_MAX_BYTES = 256 * 1024;

const runtimeIdentityIdSchema = z.string().uuid();
const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const allowedContentTypes = ["image/png", "image/jpeg", "image/webp"] as const;

export type AgentPersonaLogoContentType = (typeof allowedContentTypes)[number];

export interface ValidAgentPersonaLogo {
  contentType: AgentPersonaLogoContentType;
  dataBase64: string;
  sha256: string;
  size: number;
}

export type AgentPersonaLogoValidation =
  | { ok: true; value: ValidAgentPersonaLogo }
  | { ok: false; reason: "invalid_size" | "invalid_type" };

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return (
    bytes.length >= prefix.length &&
    prefix.every((value, index) => bytes[index] === value)
  );
}

function boundedDimensions(width: number, height: number): boolean {
  return width > 0 && height > 0 && width <= 4096 && height <= 4096;
}

function isPng(bytes: Uint8Array): boolean {
  if (
    bytes.length < 45 ||
    !hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
    !hasPrefix(bytes.slice(8), [0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]) ||
    !hasPrefix(bytes.slice(-12), [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44])
  ) {
    return false;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return boundedDimensions(view.getUint32(16), view.getUint32(20));
}

function isJpeg(bytes: Uint8Array): boolean {
  if (
    bytes.length < 12 ||
    !hasPrefix(bytes, [0xff, 0xd8]) ||
    !hasPrefix(bytes.slice(-2), [0xff, 0xd9])
  ) {
    return false;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= bytes.length - 2) {
    if (bytes[offset] !== 0xff) return false;
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) return false;
    const length = view.getUint16(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length - 2) return false;
    if (marker >= 0xc0 && marker <= 0xc3 && length >= 7) {
      return boundedDimensions(
        view.getUint16(offset + 7),
        view.getUint16(offset + 5),
      );
    }
    offset += 2 + length;
  }
  return false;
}

function isWebp(bytes: Uint8Array): boolean {
  if (
    bytes.length < 30 ||
    !hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) ||
    !hasPrefix(bytes.slice(8), [0x57, 0x45, 0x42, 0x50])
  ) {
    return false;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) + 8 !== bytes.length) return false;
  if (!hasPrefix(bytes.slice(12), [0x56, 0x50, 0x38, 0x58]) || view.getUint32(16, true) !== 10) {
    return false;
  }
  const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
  const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
  return boundedDimensions(width, height);
}

function hasMatchingMagicBytes(
  contentType: AgentPersonaLogoContentType,
  bytes: Uint8Array,
): boolean {
  switch (contentType) {
    case "image/png":
      return isPng(bytes);
    case "image/jpeg":
      return isJpeg(bytes);
    case "image/webp":
      return isWebp(bytes);
  }
}

export function validateAgentPersonaLogo({
  bytes,
  contentType,
}: {
  bytes: Uint8Array;
  contentType: string;
}): AgentPersonaLogoValidation {
  if (bytes.byteLength < 1 || bytes.byteLength > AGENT_PERSONA_LOGO_MAX_BYTES) {
    return { ok: false, reason: "invalid_size" };
  }
  if (!allowedContentTypes.includes(contentType as AgentPersonaLogoContentType)) {
    return { ok: false, reason: "invalid_type" };
  }
  const verifiedContentType = contentType as AgentPersonaLogoContentType;
  if (!hasMatchingMagicBytes(verifiedContentType, bytes)) {
    return { ok: false, reason: "invalid_type" };
  }

  return {
    ok: true,
    value: {
      contentType: verifiedContentType,
      dataBase64: Buffer.from(bytes).toString("base64"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size: bytes.byteLength,
    },
  };
}

export function buildAgentPersonaLogoUrl(
  runtimeIdentityId: string,
  sha256: string,
): string {
  if (
    !runtimeIdentityIdSchema.safeParse(runtimeIdentityId).success ||
    !digestSchema.safeParse(sha256).success
  ) {
    throw new Error("Invalid agent persona logo identity");
  }
  return `/api/agent-identity/${runtimeIdentityId}/logo/${sha256}`;
}
