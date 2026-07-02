import test from "node:test";
import assert from "node:assert/strict";
import { enrichProspectUrlWithCamoFox, resolveTrevorCamoFoxConfig, trevorCamoFoxEnrichmentToMcp } from "../src/camofox.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

test("reports CamoFox unavailable when Trevor has no service URL", async () => {
  const result = await enrichProspectUrlWithCamoFox({
    url: "https://example.test/contact"
  }, {
    env: {}
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.outboundSent, false);
  assert.match(result.warnings[0] ?? "", /CAMOFOX_URL/);
});

test("rejects non-public URLs before calling CamoFox", async () => {
  let called = false;
  const result = await enrichProspectUrlWithCamoFox({
    url: "file:///etc/passwd"
  }, {
    env: { CAMOFOX_URL: "http://camofox-browser:9377" },
    fetch: async () => {
      called = true;
      return jsonResponse({});
    }
  });

  assert.equal(result.status, "invalid_url");
  assert.equal(called, false);
});

test("uses remote CamoFox URL and closes the opened tab", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchMock = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = input.toString();
    calls.push({ url, method: init?.method ?? "GET" });
    if (url.endsWith("/tabs/open")) {
      assert.match(String(init?.body), /https:\/\/jeweler\.example\/contact/);
      return jsonResponse({ tabId: "tab-1" });
    }
    if (url.endsWith("/tabs/tab-1/snapshot?userId=trevor-prospecting")) {
      return jsonResponse({
        title: "Independent Jeweler Contact",
        url: "https://jeweler.example/contact",
        text: "Call 555-0101 or email buyer@example.test for appointments."
      });
    }
    if (url.endsWith("/tabs/tab-1/links?userId=trevor-prospecting")) {
      return jsonResponse([{ text: "Contact", href: "https://jeweler.example/contact" }]);
    }
    if (url.endsWith("/tabs/tab-1?userId=trevor-prospecting")) {
      return jsonResponse({ ok: true });
    }
    throw new Error(`unexpected URL ${url}`);
  };

  const result = await enrichProspectUrlWithCamoFox({
    url: "https://jeweler.example/contact"
  }, {
    env: {
      CAMOFOX_URL: "http://camofox-browser:9377",
      CAMOFOX_API_KEY: "secret-test-key"
    },
    fetch: fetchMock
  });

  assert.equal(result.status, "ok");
  assert.equal(result.title, "Independent Jeweler Contact");
  assert.match(result.text ?? "", /555-0101/);
  assert.equal(result.links[0]?.href, "https://jeweler.example/contact");
  assert.deepEqual(calls.map((call) => call.url), [
    "http://camofox-browser:9377/tabs/open",
    "http://camofox-browser:9377/tabs/tab-1/snapshot?userId=trevor-prospecting",
    "http://camofox-browser:9377/tabs/tab-1/links?userId=trevor-prospecting",
    "http://camofox-browser:9377/tabs/tab-1?userId=trevor-prospecting"
  ]);

  const mcp = trevorCamoFoxEnrichmentToMcp(result);
  assert.equal(mcp.enrichment_source, "camofox_website_recon");
  assert.equal(mcp.outbound_sent, false);
});

test("resolves Trevor CamoFox config from process env first", () => {
  const config = resolveTrevorCamoFoxConfig({
    CAMOFOX_URL: "http://camofox-browser:9377/",
    CAMOFOX_API_KEY: "secret-test-key"
  });

  assert.equal(config?.url, "http://camofox-browser:9377");
  assert.equal(config?.apiKey, "secret-test-key");
  assert.equal(config?.timeoutMs, 45_000);
  assert.equal(config?.source, "process_env");
});

test("allows Trevor CamoFox timeout override from process env", () => {
  const config = resolveTrevorCamoFoxConfig({
    CAMOFOX_URL: "http://camofox-browser:9377/",
    CAMOFOX_TIMEOUT_MS: "60000"
  });

  assert.equal(config?.timeoutMs, 60_000);
});
