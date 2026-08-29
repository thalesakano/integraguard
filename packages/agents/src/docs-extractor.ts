import {
  ExtractedApiDocsSchema,
  type ExtractedApiDocs,
  type ExtractedEndpoint,
} from "@integraguard/schemas";
import { parseOpenApi } from "@integraguard/tools";
import { chatCompletionDetailed, isLlmAvailable } from "./llm-client.js";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
type HttpMethod = (typeof METHODS)[number];

/** METHOD + path, including absolute API URLs and markdown link labels */
const ENDPOINT_PATTERNS: RegExp[] = [
  /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%{}]+)/gi,
  /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+https?:\/\/[^/\s]+(\/[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%{}]*)/gi,
  /\[(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[^\]]+)\]/gi,
  /`(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[^`]+)`/gi,
];

function normalizePath(raw: string): string | null {
  let path = raw.trim().replace(/[),.;:`"']+$/g, "");
  path = path.replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, (m) => `{${m.slice(1)}}`);
  if (!path.startsWith("/")) return null;
  if (path.length > 160) return null;
  if (!/^\/[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%{}]+$/.test(path) && !path.includes("{")) {
    // allow braces paths
    if (!/^\/[A-Za-z0-9\-._~/{}\-]+$/.test(path)) return null;
  }
  return path;
}

function addEndpoint(
  endpoints: ExtractedEndpoint[],
  seen: Set<string>,
  method: string,
  pathRaw: string,
  summary?: string
) {
  const methodUp = method.toUpperCase();
  if (!METHODS.includes(methodUp as HttpMethod)) return;
  const path = normalizePath(pathRaw);
  if (!path) return;
  const key = `${methodUp} ${path}`;
  if (seen.has(key)) return;
  seen.add(key);
  endpoints.push({
    method: methodUp as HttpMethod,
    path,
    summary,
    requiredFields: [],
    optionalFields: [],
    errorCodes: [],
    claims: [],
  });
}

function inferMethodForPath(path: string, context: string): HttpMethod {
  const window = context.toLowerCase();
  if (/create|add|submit|charge|post\b/.test(window)) return "POST";
  if (/update|replace|put\b/.test(window)) return "PUT";
  if (/patch|partial/.test(window)) return "PATCH";
  if (/delete|remove|cancel/.test(window)) return "DELETE";
  if (/list|retrieve|get\b|search|fetch/.test(window)) return "GET";
  if (path.includes("{") || /\/:/.test(path)) return "GET";
  if (/\/search$/.test(path)) return "GET";
  return path.split("/").filter(Boolean).length <= 2 ? "GET" : "POST";
}

function heuristicExtract(input: {
  combinedText: string;
  seedUrl: string;
  openApiSpec?: string;
  sourceUrls: string[];
  suggestedBaseUrl?: string;
}): ExtractedApiDocs {
  const endpoints: ExtractedEndpoint[] = [];
  const seen = new Set<string>();

  if (input.openApiSpec) {
    try {
      const parsed = parseOpenApi(input.openApiSpec);
      for (const ep of parsed.endpoints.slice(0, 40)) {
        addEndpoint(endpoints, seen, ep.method, ep.path, ep.summary);
      }
      if (endpoints.length) {
        const baseUrl = input.suggestedBaseUrl ?? new URL(input.seedUrl).origin;
        return {
          title: parsed.title,
          baseUrl,
          authSummary: undefined,
          endpoints,
          inconsistencies: [],
          documentationMarkdown: formatExtractedDocs({
            title: parsed.title,
            baseUrl,
            endpoints,
            inconsistencies: [],
            sourceUrls: input.sourceUrls,
          }),
          confidence: 0.7,
          sourceUrls: input.sourceUrls,
        };
      }
    } catch {
      /* fall through */
    }
  }

  for (const re of ENDPOINT_PATTERNS) {
    re.lastIndex = 0;
    for (const match of input.combinedText.matchAll(re)) {
      addEndpoint(endpoints, seen, match[1]!, match[2]!);
      if (endpoints.length >= 40) break;
    }
    if (endpoints.length >= 40) break;
  }

  // Standalone versioned API paths (common in Stripe-like docs)
  if (endpoints.length < 8) {
    const pathRe = /(\/v\d+\/[A-Za-z0-9\-._~/{}\-]+)/g;
    for (const match of input.combinedText.matchAll(pathRe)) {
      const path = normalizePath(match[1]!);
      if (!path) continue;
      // skip object ids that look like concrete resources with long tokens
      if (/\/[a-z]{2,}_[A-Za-z0-9]{8,}/.test(path)) continue;
      const idx = match.index ?? 0;
      const context = input.combinedText.slice(Math.max(0, idx - 80), idx + path.length + 80);
      const method = inferMethodForPath(path, context);
      addEndpoint(endpoints, seen, method, path);
      if (endpoints.length >= 40) break;
    }
  }

  const titleGuess =
    input.combinedText.match(/^#\s+(.+)$/m)?.[1]?.trim() ??
    `API docs from ${new URL(input.seedUrl).hostname}`;

  const baseUrl =
    input.suggestedBaseUrl ??
    input.combinedText.match(/https?:\/\/api\.[a-z0-9.-]+/i)?.[0]?.replace(/\/+$/, "") ??
    new URL(input.seedUrl).origin;

  return {
    title: titleGuess,
    baseUrl,
    endpoints,
    inconsistencies: [],
    documentationMarkdown: formatExtractedDocs({
      title: titleGuess,
      baseUrl,
      endpoints,
      inconsistencies: [],
      sourceUrls: input.sourceUrls,
      rawExcerpt: endpoints.length ? undefined : input.combinedText.slice(0, 6000),
    }),
    confidence: endpoints.length > 0 ? 0.55 : 0.25,
    sourceUrls: input.sourceUrls,
  };
}

export function formatExtractedDocs(input: {
  title: string;
  baseUrl?: string;
  authSummary?: string;
  endpoints: ExtractedEndpoint[];
  inconsistencies: string[];
  sourceUrls: string[];
  rawExcerpt?: string;
}): string {
  const lines: string[] = [
    `# ${input.title}`,
    "",
    input.baseUrl ? `Base URL: ${input.baseUrl}` : "",
    input.authSummary ? `Auth: ${input.authSummary}` : "",
    "",
    "## Endpoints",
    "",
  ].filter(Boolean);

  for (const ep of input.endpoints) {
    lines.push(`### ${ep.method} ${ep.path}`);
    if (ep.summary) lines.push(ep.summary);
    if (ep.auth) lines.push(`Auth: ${ep.auth}`);
    if (ep.requiredFields.length) lines.push(`Required fields: ${ep.requiredFields.join(", ")}`);
    if (ep.optionalFields.length) lines.push(`Optional fields: ${ep.optionalFields.join(", ")}`);
    if (ep.errorCodes.length) lines.push(`Errors: ${ep.errorCodes.join(", ")}`);
    if (ep.claims.length) lines.push(`Claims: ${ep.claims.join("; ")}`);
    if (ep.exampleRequest !== undefined) {
      lines.push("Example request:");
      lines.push("```json");
      lines.push(JSON.stringify(ep.exampleRequest, null, 2));
      lines.push("```");
    }
    if (ep.exampleResponse !== undefined) {
      lines.push("Example response:");
      lines.push("```json");
      lines.push(JSON.stringify(ep.exampleResponse, null, 2));
      lines.push("```");
    }
    lines.push("");
  }

  if (input.inconsistencies.length) {
    lines.push("## Possible inconsistencies");
    for (const item of input.inconsistencies) lines.push(`- ${item}`);
    lines.push("");
  }

  if (input.sourceUrls.length) {
    lines.push("## Sources");
    for (const u of input.sourceUrls) lines.push(`- ${u}`);
    lines.push("");
  }

  if (input.rawExcerpt) {
    lines.push("## Extracted page text (excerpt)");
    lines.push(input.rawExcerpt);
  }

  return lines.join("\n").trim();
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "name" in item && typeof (item as { name: unknown }).name === "string") {
        return (item as { name: string }).name;
      }
      return null;
    })
    .filter((x): x is string => Boolean(x));
}

function normalizeAuth(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (value === true) return "required";
  if (value === false) return "none";
  return undefined;
}

function normalizeEndpoint(raw: unknown): ExtractedEndpoint | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const method = String(e.method ?? "").toUpperCase();
  if (!METHODS.includes(method as HttpMethod)) return null;
  const path = normalizePath(String(e.path ?? ""));
  if (!path) return null;
  return {
    method: method as HttpMethod,
    path,
    summary: typeof e.summary === "string" ? e.summary : undefined,
    auth: normalizeAuth(e.auth),
    requiredFields: asStringList(e.requiredFields),
    optionalFields: asStringList(e.optionalFields),
    errorCodes: asStringList(e.errorCodes),
    claims: asStringList(e.claims),
    exampleRequest: e.exampleRequest,
    exampleResponse: e.exampleResponse,
  };
}

function clampConfidence(value: unknown, fallback = 0.75): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  if (value > 1 && value <= 100) return Math.min(1, Math.max(0, value / 100));
  return Math.min(1, Math.max(0, value));
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]!.trim()) as Record<string, unknown>;
      } catch {
        /* continue */
      }
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function extractApiDocsFromCrawl(input: {
  seedUrl: string;
  combinedText: string;
  openApiSpec?: string;
  sourceUrls: string[];
  goal?: string;
  suggestedBaseUrl?: string;
}): Promise<{ extraction: ExtractedApiDocs; usedLlm: boolean; llmError?: string }> {
  const fallback = heuristicExtract(input);

  if (!isLlmAvailable() || (!input.combinedText.trim() && !input.openApiSpec)) {
    return {
      extraction: fallback,
      usedLlm: false,
      llmError: isLlmAvailable() ? undefined : "OPENAI_API_KEY not loaded in server",
    };
  }

  const { content, error } = await chatCompletionDetailed(
    [
      {
        role: "system",
        content: `You extract structured API documentation from crawled docs sites (any vendor: Stripe-like references, Mintlify, Readme, Redoc, GitBook, etc.).
Return JSON matching:
{
  "title": string,
  "baseUrl": string | optional,
  "authSummary": string | optional,
  "endpoints": [{
    "method": "GET"|"POST"|"PUT"|"PATCH"|"DELETE"|"HEAD"|"OPTIONS",
    "path": string,
    "summary": string optional,
    "auth": string optional,
    "requiredFields": string[],
    "optionalFields": string[],
    "errorCodes": string[],
    "claims": string[],
    "exampleRequest": object optional,
    "exampleResponse": object optional
  }],
  "inconsistencies": string[],
  "confidence": number between 0 and 1
}
Rules:
- Be vendor-agnostic; do not assume a specific vendor.
- Prefer concrete method+path pairs (paths like /v1/charges).
- auth must be a short string (e.g. "bearer api key"), never a boolean.
- requiredFields/optionalFields/errorCodes/claims must be string arrays.
- Capture testable claims (idempotency, pagination, auth, error shapes).
- Max 25 endpoints, prioritize those matching the integration goal.
- confidence MUST be a number from 0 to 1 (not a percentage).
- If OpenAPI excerpt is provided, reconcile with prose docs and list inconsistencies.`,
      },
      {
        role: "user",
        content: [
          input.goal ? `Integration goal: ${input.goal}` : "",
          `Seed URL: ${input.seedUrl}`,
          input.openApiSpec
            ? `OpenAPI excerpt:\n${input.openApiSpec.slice(0, 8_000)}`
            : "No OpenAPI spec found.",
          `Crawled documentation text:\n${input.combinedText.slice(0, 18_000)}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    { temperature: 0.1, timeoutMs: 90_000 }
  );

  if (!content) {
    return { extraction: fallback, usedLlm: false, llmError: error ?? "LLM returned no content" };
  }

  const raw = parseJsonObject(content);
  if (!raw) {
    return { extraction: fallback, usedLlm: false, llmError: "LLM returned non-JSON content" };
  }

  try {
    const llmEndpoints = Array.isArray(raw.endpoints)
      ? raw.endpoints.map(normalizeEndpoint).filter((x): x is ExtractedEndpoint => Boolean(x))
      : [];

    const merged: ExtractedEndpoint[] = [];
    const seen = new Set<string>();
    for (const ep of [...llmEndpoints, ...fallback.endpoints]) {
      const key = `${ep.method} ${ep.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(ep);
      if (merged.length >= 40) break;
    }

    const draft: ExtractedApiDocs = {
      title: typeof raw.title === "string" && raw.title.trim() ? raw.title : fallback.title,
      baseUrl:
        typeof raw.baseUrl === "string" && raw.baseUrl.trim()
          ? raw.baseUrl
          : fallback.baseUrl ?? input.suggestedBaseUrl,
      authSummary: typeof raw.authSummary === "string" ? raw.authSummary : fallback.authSummary,
      endpoints: merged,
      inconsistencies: Array.isArray(raw.inconsistencies)
        ? raw.inconsistencies.filter((x): x is string => typeof x === "string")
        : [],
      documentationMarkdown: "",
      confidence: clampConfidence(raw.confidence, 0.75),
      sourceUrls: input.sourceUrls,
    };

    draft.documentationMarkdown = formatExtractedDocs({
      title: draft.title,
      baseUrl: draft.baseUrl,
      authSummary: draft.authSummary,
      endpoints: draft.endpoints,
      inconsistencies: draft.inconsistencies,
      sourceUrls: input.sourceUrls,
      rawExcerpt: draft.endpoints.length ? undefined : input.combinedText.slice(0, 6000),
    });

    const parsed = ExtractedApiDocsSchema.safeParse(draft);
    if (!parsed.success) {
      if (draft.endpoints.length > 0) {
        return {
          extraction: draft,
          usedLlm: true,
          llmError: `Schema warning: ${parsed.error.issues[0]?.message ?? "invalid shape"}`,
        };
      }
      return {
        extraction: fallback,
        usedLlm: false,
        llmError: `LLM JSON failed validation: ${parsed.error.issues[0]?.message ?? "invalid"}`,
      };
    }
    return { extraction: parsed.data, usedLlm: true };
  } catch (err) {
    return {
      extraction: fallback,
      usedLlm: false,
      llmError: err instanceof Error ? err.message : "Failed to apply LLM extraction",
    };
  }
}

export function pickSamplePayloads(
  extraction: ExtractedApiDocs,
  goal?: string
): {
  sampleRequest: unknown;
  sampleResponse?: unknown;
  primaryEndpoint?: { method: string; path: string };
} {
  const goalLc = (goal ?? "").toLowerCase();
  const ranked = [...extraction.endpoints].sort((a, b) => {
    const score = (ep: ExtractedEndpoint) => {
      let s = 0;
      if (["POST", "PUT", "PATCH"].includes(ep.method)) s += 5;
      if (ep.requiredFields.length) s += 3;
      if (ep.exampleRequest !== undefined) s += 2;
      if (goalLc && ep.path.toLowerCase().split("/").some((p) => p && goalLc.includes(p))) s += 4;
      if (goalLc && ep.summary && goalLc.includes(ep.summary.toLowerCase().slice(0, 20))) s += 2;
      return s;
    };
    return score(b) - score(a);
  });

  const primary = ranked[0];
  if (!primary) {
    return { sampleRequest: {} };
  }

  let sampleRequest: unknown = {};
  if (isJsonObjectBody(primary.exampleRequest)) {
    sampleRequest = primary.exampleRequest;
  } else if (primary.requiredFields.length || primary.optionalFields.length) {
    const body: Record<string, unknown> = {};
    for (const field of primary.requiredFields.slice(0, 10)) {
      body[field] = placeholderForField(field);
    }
    for (const field of primary.optionalFields.slice(0, 4)) {
      if (!(field in body)) body[field] = placeholderForField(field);
    }
    sampleRequest = body;
  } else if (["POST", "PUT", "PATCH"].includes(primary.method)) {
    sampleRequest = { note: `Fill request body for ${primary.method} ${primary.path}` };
  }

  return {
    sampleRequest,
    sampleResponse: isJsonObjectBody(primary.exampleResponse)
      ? primary.exampleResponse
      : primary.exampleResponse,
    primaryEndpoint: { method: primary.method, path: primary.path },
  };
}

function isJsonObjectBody(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  if ("curl" in obj && Object.keys(obj).length <= 2) return false;
  return true;
}

function placeholderForField(field: string): unknown {
  const f = field.toLowerCase();
  if (/(amount|quantity|count|total)/.test(f)) return 1;
  if (/(email)/.test(f)) return "user@example.com";
  if (/(url)/.test(f)) return "https://example.com/callback";
  if (/(currency)/.test(f)) return "usd";
  if (/(mode)/.test(f)) return "payment";
  if (/(line_items|items|lines)/.test(f)) {
    return [{ price: "price_xxx", quantity: 1 }];
  }
  if (/(metadata)/.test(f)) return { source: "integraguard" };
  return `<${field}>`;
}

/** Build a minimal OpenAPI 3 document so the workflow mapper/probes use crawled endpoints. */
export function buildOpenApiFromExtraction(extraction: ExtractedApiDocs): string {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const ep of extraction.endpoints.slice(0, 40)) {
    const pathKey = ep.path.replace(/:([A-Za-z_][\w]*)/g, "{$1}");
    const method = ep.method.toLowerCase();
    if (!paths[pathKey]) paths[pathKey] = {};

    const properties: Record<string, { type: string }> = {};
    const required: string[] = [];
    for (const field of ep.requiredFields) {
      properties[field] = { type: "string" };
      required.push(field);
    }
    for (const field of ep.optionalFields) {
      if (!properties[field]) properties[field] = { type: "string" };
    }

    const op: Record<string, unknown> = {
      summary: ep.summary ?? `${ep.method} ${ep.path}`,
      operationId: `${method}_${pathKey.replace(/[^\w]+/g, "_").replace(/^_|_$/g, "")}`,
      responses: {
        "200": { description: "Successful response" },
        "400": { description: "Client error" },
      },
    };

    if (ep.auth) {
      op.security = [{ bearerAuth: [] }];
    }

    if (["post", "put", "patch"].includes(method) && Object.keys(properties).length > 0) {
      op.requestBody = {
        required: required.length > 0,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties,
              ...(required.length ? { required } : {}),
            },
          },
        },
      };
    }

    paths[pathKey]![method] = op;
  }

  const doc = {
    openapi: "3.0.3",
    info: {
      title: extraction.title || "Extracted API",
      version: "1.0.0",
      description: extraction.authSummary
        ? `Extracted by IntegraGuard. Auth: ${extraction.authSummary}`
        : "Extracted by IntegraGuard from documentation URL crawl.",
    },
    servers: extraction.baseUrl ? [{ url: extraction.baseUrl.replace(/\/+$/, "") }] : [],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
    },
  };

  return JSON.stringify(doc, null, 2);
}
