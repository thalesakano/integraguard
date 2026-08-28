import AjvImport from "ajv";
import YAML from "yaml";
import type { HttpProbeResult } from "@integraguard/schemas";

const Ajv = (AjvImport as unknown as { default: typeof AjvImport }).default ?? AjvImport;

export interface HttpProbeConfig {
  probeId: string;
  sandboxUrl: string;
  method: string;
  endpoint: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

function redactSecrets(obj: unknown): unknown {
  if (typeof obj !== "object" || obj === null) return obj;
  const redacted: Record<string, unknown> = {};
  const sensitiveKey = /^(authorization|x-api-key|api[_-]?key|apikey|token|secret|password|cookie)$/i;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (sensitiveKey.test(k)) {
      redacted[k] = "[REDACTED]";
    } else if (typeof v === "object") {
      redacted[k] = redactSecrets(v);
    } else {
      redacted[k] = v;
    }
  }
  return redacted;
}

export async function httpProbe(config: HttpProbeConfig): Promise<HttpProbeResult> {
  const start = Date.now();
  const base = config.sandboxUrl.endsWith("/") ? config.sandboxUrl : config.sandboxUrl + "/";
  const url = new URL(config.endpoint.replace(/^\//, ""), base);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 10000);

  try {
    const response = await fetch(url.toString(), {
      method: config.method,
      headers: {
        "Content-Type": "application/json",
        ...config.headers,
      },
      body: config.body !== undefined ? JSON.stringify(config.body) : undefined,
      signal: controller.signal,
    });

    let body: unknown;
    const text = await response.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      headers[k] = v;
    });

    return {
      probeId: config.probeId,
      statusCode: response.status,
      headers,
      body: redactSecrets(body),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      probeId: config.probeId,
      statusCode: 0,
      headers: {},
      body: null,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export interface ParsedEndpoint {
  method: string;
  path: string;
  summary?: string;
  requestSchema?: unknown;
  responseSchema?: unknown;
  security?: string[];
}

export interface ParsedOpenApi {
  title: string;
  version: string;
  endpoints: ParsedEndpoint[];
  schemas: Record<string, unknown>;
}

export function parseOpenApi(spec: string): ParsedOpenApi {
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(spec) as Record<string, unknown>;
  } catch {
    doc = YAML.parse(spec) as Record<string, unknown>;
  }

  const info = (doc.info as Record<string, unknown>) ?? {};
  const paths = (doc.paths as Record<string, Record<string, unknown>>) ?? {};
  const components = (doc.components as Record<string, unknown>) ?? {};
  const schemas = (components.schemas as Record<string, unknown>) ?? {};

  const endpoints: ParsedEndpoint[] = [];
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, details] of Object.entries(methods)) {
      if (["get", "post", "put", "patch", "delete"].includes(method.toLowerCase())) {
        const d = details as Record<string, unknown>;
        endpoints.push({
          method: method.toUpperCase(),
          path,
          summary: d.summary as string | undefined,
          security: d.security ? Object.keys((d.security as object[])[0] ?? {}) : undefined,
        });
      }
    }
  }

  return {
    title: (info.title as string) ?? "API",
    version: (info.version as string) ?? "1.0",
    endpoints,
    schemas,
  };
}

export interface DocSection {
  title: string;
  content: string;
  reference: string;
}

export function parseMarkdownDocs(md: string, fileName = "api-docs.md"): DocSection[] {
  const sections: DocSection[] = [];
  const lines = md.split("\n");
  let currentTitle = "Introduction";
  let currentContent: string[] = [];
  let lineNum = 1;

  const flush = (endLine: number) => {
    if (currentContent.length > 0) {
      sections.push({
        title: currentTitle,
        content: currentContent.join("\n").trim(),
        reference: `${fileName}#${currentTitle.toLowerCase().replace(/\s+/g, "-")} (L${lineNum}-${endLine})`,
      });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("#")) {
      flush(i);
      currentTitle = line.replace(/^#+\s*/, "");
      currentContent = [];
      lineNum = i + 1;
    } else {
      currentContent.push(line);
    }
  }
  flush(lines.length);
  return sections;
}

export function validateJsonSchema(data: unknown, schema: object): { valid: boolean; errors: string[] } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ajv = new (Ajv as any)({ allErrors: true });
  const validate = ajv.compile(schema);
  const valid = validate(data) as boolean;
  const errors = validate.errors?.map((e: { instancePath: string; message?: string }) => `${e.instancePath} ${e.message}`) ?? [];
  return { valid, errors };
}
