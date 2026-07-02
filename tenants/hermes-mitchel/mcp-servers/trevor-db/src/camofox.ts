import { readFileSync } from "node:fs";
import { sanitizeError } from "./safety.js";

const DEFAULT_ENV_FILE = "/opt/data/.env";
const DEFAULT_USER_ID = "trevor-prospecting";
const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_TEXT_LENGTH = 4000;
const MAX_LINKS = 30;

export interface TrevorCamoFoxConfig {
  url: string;
  apiKey: string | null;
  timeoutMs: number;
  source: "process_env" | "env_file";
}

export interface TrevorCamoFoxEnrichInput {
  url: string;
  userId?: string;
  includeLinks?: boolean;
}

export interface TrevorCamoFoxLink {
  text: string | null;
  href: string | null;
}

export interface TrevorCamoFoxEnrichResult {
  status: "ok" | "unavailable" | "invalid_url" | "error";
  url: string;
  finalUrl: string | null;
  title: string | null;
  text: string | null;
  links: TrevorCamoFoxLink[];
  enrichmentSource: "camofox_website_recon";
  warnings: string[];
  outboundSent: false;
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

function readEnvFile(path: string): Record<string, string> {
  try {
    const values: Record<string, string> = {};
    const content = readFileSync(path, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
      if (!match) continue;
      const value = match[2]?.trim() ?? "";
      values[match[1]] = value.replace(/^['"]|['"]$/g, "");
    }
    return values;
  } catch {
    return {};
  }
}

function parseTimeoutMs(value: string | undefined): number {
  if (!value) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1_000) return DEFAULT_TIMEOUT_MS;
  return parsed;
}

export function resolveTrevorCamoFoxConfig(env: NodeJS.ProcessEnv = process.env): TrevorCamoFoxConfig | null {
  const envUrl = env.CAMOFOX_URL?.trim();
  if (envUrl) {
    return {
      url: envUrl.replace(/\/+$/, ""),
      apiKey: env.CAMOFOX_API_KEY?.trim() || null,
      timeoutMs: parseTimeoutMs(env.CAMOFOX_TIMEOUT_MS),
      source: "process_env"
    };
  }

  const fileValues = readEnvFile(env.CAMOFOX_ENV_FILE?.trim() || DEFAULT_ENV_FILE);
  const fileUrl = fileValues.CAMOFOX_URL?.trim();
  if (!fileUrl) return null;
  return {
    url: fileUrl.replace(/\/+$/, ""),
    apiKey: fileValues.CAMOFOX_API_KEY?.trim() || null,
    timeoutMs: parseTimeoutMs(fileValues.CAMOFOX_TIMEOUT_MS),
    source: "env_file"
  };
}

function normalizePublicUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function truncate(value: string | null | undefined, max = MAX_TEXT_LENGTH): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
}

function collectText(value: unknown): string | null {
  if (typeof value === "string") return truncate(value);
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["text", "markdown", "content", "snapshot", "bodyText"]) {
    const candidate = record[key];
    if (typeof candidate === "string") return truncate(candidate);
  }
  if (Array.isArray(record.nodes)) {
    return truncate(record.nodes.map((node) => {
      if (typeof node === "string") return node;
      if (node && typeof node === "object") {
        const item = node as Record<string, unknown>;
        return typeof item.text === "string" ? item.text : "";
      }
      return "";
    }).filter(Boolean).join(" "));
  }
  return truncate(JSON.stringify(value));
}

function collectLinks(value: unknown): TrevorCamoFoxLink[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_LINKS).map((item) => {
    if (typeof item === "string") return { text: null, href: item };
    if (!item || typeof item !== "object") return { text: null, href: null };
    const record = item as Record<string, unknown>;
    return {
      text: truncate(typeof record.text === "string" ? record.text : typeof record.label === "string" ? record.label : null, 200),
      href: truncate(typeof record.href === "string" ? record.href : typeof record.url === "string" ? record.url : null, 500)
    };
  }).filter((link) => link.text || link.href);
}

function firstString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function findTabId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const direct = firstString(record, ["tabId", "id", "targetId"]);
  if (direct) return direct;
  for (const key of ["tab", "data"]) {
    const nested = findTabId(record[key]);
    if (nested) return nested;
  }
  return null;
}

function tabPath(tabId: string, suffix: string, userId: string): string {
  const params = new URLSearchParams({ userId });
  return `/tabs/${encodeURIComponent(tabId)}${suffix}?${params.toString()}`;
}

async function requestJson(
  fetchImpl: FetchLike,
  config: TrevorCamoFoxConfig,
  path: string,
  init: RequestInit = {}
): Promise<unknown> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init.headers as Record<string, string> | undefined)
  };
  if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
  const response = await fetchImpl(`${config.url}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(config.timeoutMs)
  });
  if (!response.ok) {
    throw new Error(`CamoFox HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json();
  return response.text();
}

export async function enrichProspectUrlWithCamoFox(
  input: TrevorCamoFoxEnrichInput,
  options: { env?: NodeJS.ProcessEnv; fetch?: FetchLike } = {}
): Promise<TrevorCamoFoxEnrichResult> {
  const target = normalizePublicUrl(input.url);
  if (!target) {
    return {
      status: "invalid_url",
      url: input.url,
      finalUrl: null,
      title: null,
      text: null,
      links: [],
      enrichmentSource: "camofox_website_recon",
      warnings: ["Only http and https URLs can be enriched."],
      outboundSent: false
    };
  }

  const config = resolveTrevorCamoFoxConfig(options.env);
  if (!config) {
    return {
      status: "unavailable",
      url: target.toString(),
      finalUrl: null,
      title: null,
      text: null,
      links: [],
      enrichmentSource: "camofox_website_recon",
      warnings: ["CAMOFOX_URL is not configured for Trevor."],
      outboundSent: false
    };
  }

  const fetchImpl = options.fetch ?? globalThis.fetch;
  const userId = input.userId?.trim() || DEFAULT_USER_ID;
  let tabId: string | null = null;
  const warnings: string[] = [];

  try {
    const opened = await requestJson(fetchImpl, config, "/tabs/open", {
      method: "POST",
      body: JSON.stringify({ userId, url: target.toString() })
    });
    tabId = findTabId(opened);
    if (!tabId) throw new Error("CamoFox did not return a tab id.");

    const snapshot = await requestJson(fetchImpl, config, tabPath(tabId, "/snapshot", userId), {
      method: "GET"
    });
    const links = input.includeLinks === false
      ? []
      : collectLinks(await requestJson(fetchImpl, config, tabPath(tabId, "/links", userId), { method: "GET" }));
    return {
      status: "ok",
      url: target.toString(),
      finalUrl: firstString(snapshot, ["url", "finalUrl"]) ?? target.toString(),
      title: firstString(snapshot, ["title", "pageTitle"]),
      text: collectText(snapshot),
      links,
      enrichmentSource: "camofox_website_recon",
      warnings,
      outboundSent: false
    };
  } catch (err) {
    return {
      status: "error",
      url: target.toString(),
      finalUrl: null,
      title: null,
      text: null,
      links: [],
      enrichmentSource: "camofox_website_recon",
      warnings: [`CamoFox enrichment failed: ${sanitizeError(err)}`],
      outboundSent: false
    };
  } finally {
    if (tabId) {
      await requestJson(fetchImpl, config, tabPath(tabId, "", userId), { method: "DELETE" }).catch(() => undefined);
    }
  }
}

export function trevorCamoFoxEnrichmentToMcp(result: TrevorCamoFoxEnrichResult) {
  return {
    status: result.status,
    url: result.url,
    final_url: result.finalUrl,
    title: result.title,
    text: result.text,
    links: result.links.map((link) => ({ text: link.text, href: link.href })),
    enrichment_source: result.enrichmentSource,
    warnings: result.warnings,
    outbound_sent: false
  };
}
