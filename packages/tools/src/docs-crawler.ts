export interface CrawlOptions {
  seedUrl: string;
  maxPages?: number;
  maxBytesPerPage?: number;
  timeoutMs?: number;
  /** When set, every fetch uses fail-closed redirect/host validation. */
  egressPolicy?: import("./safe-url.js").EgressPolicy;
}

export interface CrawledPage {
  url: string;
  title: string;
  text: string;
  score: number;
  contentType: "html" | "markdown" | "text";
}

export interface DocsCrawlResult {
  seedUrl: string;
  origin: string;
  pages: CrawledPage[];
  openApiUrls: string[];
  openApiSpec?: string;
  combinedText: string;
  warnings: string[];
  suggestedBaseUrl?: string;
}

const DOC_PATH_HINT =
  /\/(api|reference|docs|documentation|endpoints?|rest|graphql|openapi|swagger|guide|developers?)(\/|$|\.md)/i;
const ASSET_EXT = /\.(css|js|mjs|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|pdf|zip|tgz)(\?|$)/i;
const OPENAPI_HREF = /openapi|swagger\.(json|yaml|yml)|api-docs|redoc/i;
const COMMON_OPENAPI_PATHS = [
  "/openapi.json",
  "/openapi.yaml",
  "/openapi.yml",
  "/swagger.json",
  "/swagger.yaml",
  "/api/openapi.json",
  "/api/swagger.json",
  "/v1/openapi.json",
  "/docs/openapi.json",
  "/.well-known/openapi.json",
];

function normalizeUrl(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

function scoreDocUrl(url: string, seedUrl: string): number {
  let score = 0;
  try {
    const u = new URL(url);
    const seed = new URL(seedUrl);
    if (u.pathname === seed.pathname) score += 20;
    if (DOC_PATH_HINT.test(u.pathname)) score += 10;
    if (OPENAPI_HREF.test(u.pathname)) score += 15;
    if (/\.md$/i.test(u.pathname)) score += 12;
    if (/\/llms\.txt$/i.test(u.pathname)) score += 25;
    if (/\/api(\/|$|\.md)/i.test(u.pathname)) score += 8;
    if (/\/(get|post|put|patch|delete|create|list|retrieve|update|search)/i.test(u.pathname))
      score += 6;
    if (u.pathname.split("/").filter(Boolean).length <= 5) score += 2;
    if (ASSET_EXT.test(u.pathname)) score -= 100;
    if (/\b(blog|careers|pricing|login|signup|changelog)\b/i.test(u.pathname)) score -= 8;
  } catch {
    return -1;
  }
  return score;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export function htmlToText(html: string): { title: string; text: string; links: string[] } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]!.replace(/\s+/g, " ").trim()) : "";

  const links: string[] = [];
  const hrefRe = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    links.push(m[1]!);
  }

  const linkHeader = /<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((m = linkHeader.exec(html)) !== null) {
    links.push(m[1]!);
  }

  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const mainMatch =
    cleaned.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ??
    cleaned.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (mainMatch) cleaned = mainMatch[1]!;

  cleaned = cleaned
    .replace(/<\/(p|div|h[1-6]|li|tr|section|br|pre)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const text = decodeEntities(cleaned)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return { title, text, links };
}

function extractMarkdownLinks(md: string): string[] {
  const links: string[] = [];
  const re = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    links.push(m[1]!);
  }
  // bare urls
  const bare = /https?:\/\/[^\s<>)"']+/g;
  while ((m = bare.exec(md)) !== null) {
    links.push(m[0]!);
  }
  return links;
}

function markdownTitle(md: string): string {
  return md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
}

function extractSuggestedBaseUrl(text: string): string | undefined {
  const labeled =
    text.match(/base\s*url[:\s`*]*\n+\s*`?(https?:\/\/[^\s`]+)`?/i) ??
    text.match(/base\s*url[:\s]*`?(https?:\/\/[^\s`]+)`?/i);
  if (labeled) return labeled[1]!.replace(/\/+$/, "");

  const apiHost = text.match(/https?:\/\/api\.[a-z0-9.-]+/i);
  if (apiHost) return apiHost[0]!.replace(/\/+$/, "");
  return undefined;
}

async function fetchText(
  url: string,
  opts: {
    timeoutMs: number;
    maxBytes: number;
    accept?: string;
    egressPolicy?: import("./safe-url.js").EgressPolicy;
  }
): Promise<{ ok: boolean; status: number; contentType: string; body: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    let res: Response;
    if (opts.egressPolicy) {
      const { fetchWithValidatedRedirects } = await import("./safe-url.js");
      res = await fetchWithValidatedRedirects(
        url,
        {
          headers: {
            Accept:
              opts.accept ??
              "text/markdown,text/plain,text/html,application/xhtml+xml,application/json,application/yaml,*/*",
            "User-Agent": "IntegraGuardDocsCrawler/0.1",
          },
          signal: controller.signal,
        },
        opts.egressPolicy
      );
    } else {
      res = await fetch(url, {
        headers: {
          Accept:
            opts.accept ??
            "text/markdown,text/plain,text/html,application/xhtml+xml,application/json,application/yaml,*/*",
          "User-Agent": "IntegraGuardDocsCrawler/0.1 (+https://github.com/integraguard)",
        },
        signal: controller.signal,
        redirect: "follow",
      });
    }
    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > opts.maxBytes ? buf.slice(0, opts.maxBytes) : buf;
    return {
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      body: new TextDecoder().decode(slice),
      finalUrl: res.url || url,
    };
  } finally {
    clearTimeout(timer);
  }
}

function looksLikeOpenApi(body: string, contentType: string): boolean {
  const ct = contentType.toLowerCase();
  if (ct.includes("json") || ct.includes("yaml") || ct.includes("yml")) {
    return /["']?openapi["']?\s*:/i.test(body) || /["']?swagger["']?\s*:/i.test(body);
  }
  return /^\s*\{/.test(body)
    ? /"openapi"\s*:/.test(body) || /"swagger"\s*:/.test(body)
    : /^openapi:\s*/m.test(body) || /^swagger:\s*/m.test(body);
}

function isMarkdownContent(url: string, contentType: string, body: string): boolean {
  if (/\.md(\?|$)/i.test(url) || /llms\.txt(\?|$)/i.test(url)) return true;
  const ct = contentType.toLowerCase();
  if (ct.includes("markdown") || ct.includes("text/plain")) {
    return /^#\s+/m.test(body) || /\[.+\]\(.+\)/.test(body);
  }
  return false;
}

function markdownAlternates(seedUrl: string): string[] {
  const u = new URL(seedUrl);
  const alts: string[] = [];
  if (!/\.md$/i.test(u.pathname)) {
    alts.push(`${u.origin}${u.pathname.replace(/\/$/, "")}.md`);
    alts.push(`${u.origin}${u.pathname.replace(/\/$/, "")}/index.md`);
  }
  alts.push(`${u.origin}/llms.txt`);
  alts.push(`${u.origin}/llm.txt`);
  return [...new Set(alts)];
}

async function discoverOpenApi(
  origin: string,
  candidates: string[],
  opts: {
    timeoutMs: number;
    maxBytes: number;
    egressPolicy?: import("./safe-url.js").EgressPolicy;
  }
): Promise<{ urls: string[]; spec?: string }> {
  const urls = new Set<string>();
  let spec: string | undefined;

  const queue = [...candidates, ...COMMON_OPENAPI_PATHS.map((p) => `${origin}${p}`)];

  for (const raw of queue.slice(0, 12)) {
    const url = normalizeUrl(raw, origin);
    if (!url || !sameOrigin(url, origin)) continue;
    try {
      const res = await fetchText(url, {
        timeoutMs: Math.min(opts.timeoutMs, 10_000),
        maxBytes: opts.maxBytes,
        accept: "application/json,application/yaml,text/yaml,text/plain,*/*",
        egressPolicy: opts.egressPolicy,
      });
      if (!res.ok) continue;
      if (looksLikeOpenApi(res.body, res.contentType)) {
        urls.add(url);
        if (!spec) spec = res.body;
      }
    } catch {
      /* ignore probe failures */
    }
  }

  return { urls: [...urls], spec };
}

/**
 * Vendor-agnostic crawl for API reference / docs sites.
 * Prefers markdown / llms.txt when available (common on modern docs platforms).
 */
export async function crawlApiDocs(options: CrawlOptions): Promise<DocsCrawlResult> {
  const maxPages = options.maxPages ?? 10;
  const maxBytes = options.maxBytesPerPage ?? 400_000;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const egressPolicy = options.egressPolicy;
  const warnings: string[] = [];

  const seedUrl = normalizeUrl(options.seedUrl, options.seedUrl);
  if (!seedUrl) {
    throw new Error("Invalid docs URL");
  }

  const origin = new URL(seedUrl).origin;
  const seen = new Set<string>();
  const queue: { url: string; score: number }[] = [{ url: seedUrl, score: 100 }];

  // Prefer machine-readable docs first
  for (const alt of markdownAlternates(seedUrl)) {
    queue.push({ url: alt, score: scoreDocUrl(alt, seedUrl) + 30 });
  }

  const pages: CrawledPage[] = [];
  const openApiCandidates: string[] = [];
  let suggestedBaseUrl: string | undefined;

  while (queue.length > 0 && pages.length < maxPages) {
    queue.sort((a, b) => b.score - a.score);
    const next = queue.shift()!;
    if (seen.has(next.url)) continue;
    seen.add(next.url);

    let fetched;
    try {
      fetched = await fetchText(next.url, { timeoutMs, maxBytes, egressPolicy });
    } catch (err) {
      warnings.push(`Failed to fetch ${next.url}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    if (!fetched.ok) {
      if (!markdownAlternates(seedUrl).includes(next.url) && !/llms\.txt$/i.test(next.url)) {
        warnings.push(`HTTP ${fetched.status} for ${next.url}`);
      }
      continue;
    }

    if (looksLikeOpenApi(fetched.body, fetched.contentType)) {
      openApiCandidates.push(fetched.finalUrl || next.url);
      continue;
    }

    const markdown = isMarkdownContent(next.url, fetched.contentType, fetched.body);
    let title = "";
    let text = "";
    let links: string[] = [];

    if (markdown) {
      title = markdownTitle(fetched.body) || next.url;
      text = fetched.body.slice(0, 40_000);
      links = extractMarkdownLinks(fetched.body);
    } else {
      const parsed = htmlToText(fetched.body);
      title = parsed.title;
      text = parsed.text.slice(0, 20_000);
      links = parsed.links;
      if (text.length < 80) {
        warnings.push(`Sparse HTML at ${next.url} (may be JS-rendered); trying markdown alternatives`);
      }
    }

    if (!suggestedBaseUrl) {
      suggestedBaseUrl = extractSuggestedBaseUrl(text);
    }

    if (text.trim().length > 0) {
      pages.push({
        url: fetched.finalUrl || next.url,
        title,
        text,
        score: next.score + (markdown ? 15 : 0),
        contentType: markdown ? ( /llms\.txt$/i.test(next.url) ? "text" : "markdown") : "html",
      });
    }

    for (const href of links) {
      const abs = normalizeUrl(href, next.url);
      if (!abs || seen.has(abs)) continue;
      if (ASSET_EXT.test(abs)) continue;
      if (!sameOrigin(abs, origin)) continue;

      if (OPENAPI_HREF.test(abs)) {
        openApiCandidates.push(abs);
      }

      const score = scoreDocUrl(abs, seedUrl);
      if (score >= 4 || /\.md(\?|$)/i.test(abs) || /llms\.txt$/i.test(abs)) {
        queue.push({ url: abs, score });
      }
    }
  }

  const openApi = await discoverOpenApi(origin, openApiCandidates, {
    timeoutMs,
    maxBytes,
    egressPolicy,
  });

  // Prefer markdown pages in the combined corpus
  const ordered = [...pages].sort((a, b) => {
    const am = a.contentType === "markdown" ? 1 : 0;
    const bm = b.contentType === "markdown" ? 1 : 0;
    return bm - am || b.score - a.score;
  });

  const combinedText = ordered
    .map((p) => `## Source: ${p.url}\n# ${p.title || "Untitled"}\n\n${p.text}`)
    .join("\n\n---\n\n")
    .slice(0, 100_000);

  if (!combinedText.trim() && !openApi.spec) {
    warnings.push("No usable documentation text or OpenAPI spec found");
  }

  return {
    seedUrl,
    origin,
    pages: ordered,
    openApiUrls: openApi.urls,
    openApiSpec: openApi.spec,
    combinedText,
    warnings,
    suggestedBaseUrl,
  };
}
