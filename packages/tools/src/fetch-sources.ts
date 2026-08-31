/**
 * Load documentation / OpenAPI from a local file or remote URL.
 * Never invents synthetic endpoint docs on fetch failure.
 */
import { existsSync, readFileSync } from "node:fs";
import { crawlApiDocs, type DocsCrawlResult } from "./docs-crawler.js";
import {
  fetchWithValidatedRedirects,
  validateTargetUrl,
  type EgressPolicy,
} from "./safe-url.js";

export interface LoadedSources {
  documentation: string;
  openApiSpec?: string;
  warnings: string[];
  sourceLabel: string;
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function defaultPolicyForUrl(url: string, extraHosts: string[] = []): EgressPolicy {
  const host = new URL(url).hostname;
  const local =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local");
  return {
    allowedHosts: [...new Set([host, ...extraHosts])],
    allowPrivateNetwork: local,
    allowedPorts: local ? [80, 443, 3000, 4000, 8080, Number(new URL(url).port || 0)].filter(Boolean) : undefined,
    maxRedirects: 3,
    maxResponseBytes: 2_000_000,
  };
}

async function fetchUrlText(url: string, policy: EgressPolicy): Promise<string> {
  const validated = validateTargetUrl(url, policy);
  if (!validated.ok) {
    throw new Error(`Refusing to fetch docs: ${validated.reason}`);
  }
  const res = await fetchWithValidatedRedirects(
    url,
    {
      headers: {
        Accept: "text/markdown,text/plain,text/html,application/json,application/yaml,*/*",
        "User-Agent": "IntegraGuardDocsFetcher/0.1",
      },
    },
    policy
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  return await res.text();
}

/**
 * Load docs from a filesystem path or http(s) URL.
 * On URL failure throws — does not synthesize placeholder API docs.
 */
export async function loadDocumentationSource(
  pathOrUrl: string,
  options?: { allowedHosts?: string[]; egressPolicy?: EgressPolicy }
): Promise<LoadedSources> {
  if (existsSync(pathOrUrl)) {
    const documentation = readFileSync(pathOrUrl, "utf-8");
    if (!documentation.trim()) {
      throw new Error(`Documentation file is empty: ${pathOrUrl}`);
    }
    return {
      documentation,
      warnings: [],
      sourceLabel: `file:${pathOrUrl}`,
    };
  }

  if (!isHttpUrl(pathOrUrl)) {
    throw new Error(
      `Documentation source not found as file and is not an http(s) URL: ${pathOrUrl}`
    );
  }

  const policy =
    options?.egressPolicy ?? defaultPolicyForUrl(pathOrUrl, options?.allowedHosts ?? []);

  // Prefer crawler for HTML docs sites; plain text/markdown/OpenAPI also work via fetch.
  let crawl: DocsCrawlResult | undefined;
  try {
    crawl = await crawlApiDocs({
      seedUrl: pathOrUrl,
      maxPages: 8,
      timeoutMs: 15_000,
      egressPolicy: policy,
    });
  } catch (err) {
    // Fall back to single-page fetch
    const body = await fetchUrlText(pathOrUrl, policy);
    if (!body.trim()) throw new Error(`Empty response from ${pathOrUrl}`);
    return {
      documentation: body,
      warnings: [
        `Crawler failed (${err instanceof Error ? err.message : String(err)}); used single-page fetch`,
      ],
      sourceLabel: pathOrUrl,
    };
  }

  const documentation = crawl.combinedText?.trim();
  if (!documentation) {
    throw new Error(
      `Fetched ${pathOrUrl} but extracted no documentation text. Check the URL or paste docs into config.`
    );
  }

  return {
    documentation,
    openApiSpec: crawl.openApiSpec,
    warnings: crawl.warnings,
    sourceLabel: pathOrUrl,
  };
}

export async function loadOpenApiSource(
  pathOrUrl: string,
  options?: { allowedHosts?: string[]; egressPolicy?: EgressPolicy }
): Promise<string> {
  if (existsSync(pathOrUrl)) {
    const body = readFileSync(pathOrUrl, "utf-8");
    if (!body.trim()) throw new Error(`OpenAPI file is empty: ${pathOrUrl}`);
    return body;
  }
  if (!isHttpUrl(pathOrUrl)) {
    throw new Error(`OpenAPI source not found: ${pathOrUrl}`);
  }
  const policy =
    options?.egressPolicy ?? defaultPolicyForUrl(pathOrUrl, options?.allowedHosts ?? []);
  return fetchUrlText(pathOrUrl, policy);
}
