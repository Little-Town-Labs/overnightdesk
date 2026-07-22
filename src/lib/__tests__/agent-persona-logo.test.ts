import {
  AGENT_PERSONA_LOGO_MAX_BYTES,
  buildAgentPersonaLogoUrl,
  validateAgentPersonaLogo,
} from "@/lib/agent-persona-logo";

const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);
const jpeg = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01,
  0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff,
  0xd9,
]);
const webp = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x16, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58,
  0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

describe("agent persona logo", () => {
  it.each([
    ["image/png", png],
    ["image/jpeg", jpeg],
    ["image/webp", webp],
  ])("accepts a bounded %s raster whose magic bytes match", (contentType, bytes) => {
    expect(validateAgentPersonaLogo({ contentType, bytes })).toEqual({
      ok: true,
      value: expect.objectContaining({
        contentType,
        dataBase64: Buffer.from(bytes).toString("base64"),
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        size: bytes.byteLength,
      }),
    });
  });

  it.each([
    ["image/png", jpeg],
    ["image/jpeg", webp],
    ["image/webp", png],
    ["image/svg+xml", new TextEncoder().encode("<svg onload='alert(1)'/>")],
    ["text/html", new TextEncoder().encode("<script>alert(1)</script>")],
  ])("rejects an unsupported or magic-byte-mismatched %s upload", (contentType, bytes) => {
    expect(validateAgentPersonaLogo({ contentType, bytes })).toEqual({
      ok: false,
      reason: "invalid_type",
    });
  });

  it("rejects empty and oversized input before hashing or storage", () => {
    expect(
      validateAgentPersonaLogo({ contentType: "image/png", bytes: new Uint8Array() }),
    ).toEqual({ ok: false, reason: "invalid_size" });
    expect(
      validateAgentPersonaLogo({
        contentType: "image/png",
        bytes: new Uint8Array(AGENT_PERSONA_LOGO_MAX_BYTES + 1),
      }),
    ).toEqual({ ok: false, reason: "invalid_size" });
  });

  it.each([
    ["image/png", png.slice(0, 24)],
    ["image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])],
    ["image/webp", webp.slice(0, 12)],
  ])("rejects a truncated or structurally invalid %s image", (contentType, bytes) => {
    expect(validateAgentPersonaLogo({ contentType, bytes })).toEqual({
      ok: false,
      reason: "invalid_type",
    });
  });

  it("builds only an immutable same-origin runtime and digest path", () => {
    const runtimeIdentityId = "22222222-2222-4222-8222-222222222222";
    const digest = "a".repeat(64);

    expect(buildAgentPersonaLogoUrl(runtimeIdentityId, digest)).toBe(
      `/api/agent-identity/${runtimeIdentityId}/logo/${digest}`,
    );
    expect(() => buildAgentPersonaLogoUrl("not-a-uuid", digest)).toThrow(
      "Invalid agent persona logo identity",
    );
    expect(() => buildAgentPersonaLogoUrl(runtimeIdentityId, "../logo")).toThrow(
      "Invalid agent persona logo identity",
    );
  });
});
