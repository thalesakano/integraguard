import { generateId, type DocumentedExpectation } from "@integraguard/schemas";
import { DocumentedExpectationSchema } from "@integraguard/schemas";
import { parseMarkdownDocs, parseOpenApi } from "@integraguard/tools";
import { z } from "zod";
import { isLlmAvailable } from "./llm-client.js";
import { structuredCompletion } from "./structured-completion.js";

export const DOCS_ANALYST_VERSION = "v2";

export interface DocsAnalystInput {
  goal: string;
  documentation: string;
  openApiSpec?: string;
  useLlm?: boolean;
}

const LlmEnvelope = z.object({
  expectations: z.array(DocumentedExpectationSchema),
});

export function extractExpectationsDeterministic(input: DocsAnalystInput): DocumentedExpectation[] {
  const expectations: DocumentedExpectation[] = [];
  const sections = parseMarkdownDocs(input.documentation);
  const endpoints = input.openApiSpec
    ? parseOpenApi(input.openApiSpec).endpoints
    : [];

  let method = "POST";
  let path = "/v1/resource";
  const postMatch = input.documentation.match(/POST\s+(\S+)/i);
  const getMatch = input.documentation.match(/GET\s+(\S+)/i);
  if (postMatch) {
    method = "POST";
    path = postMatch[1]!;
  } else if (getMatch) {
    method = "GET";
    path = getMatch[1]!.split("?")[0]!;
  } else if (endpoints[0]) {
    method = endpoints[0].method;
    path = endpoints[0].path;
  }

  const httpMethod = (["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(
    method.toUpperCase()
  )
    ? method.toUpperCase()
    : "POST") as DocumentedExpectation["endpoint"]["method"];

  expectations.push({
    id: generateId("EXP"),
    endpoint: { method: httpMethod, path },
    category: "request-schema",
    statement: "Request body must match documented required fields",
    source: {
      section: sections[0]?.title ?? "Documentation",
      excerpt: sections[0]?.content.slice(0, 160) ?? input.documentation.slice(0, 160),
    },
    confidence: 0.7,
    validationPredicate: "probe.request fields satisfy documented required set",
  });

  if (/idempoten/i.test(input.documentation)) {
    expectations.push({
      id: generateId("EXP"),
      endpoint: { method: httpMethod, path },
      category: "idempotency",
      statement: "Documentation claims idempotent submissions via Idempotency-Key",
      source: {
        section: "Idempotency",
        excerpt: "idempotency",
      },
      confidence: 0.85,
      validationPredicate: "duplicate Idempotency-Key yields same resource id",
    });
  }

  if (/4xx|5xx|errors are returned as HTTP/i.test(input.documentation)) {
    expectations.push({
      id: generateId("EXP"),
      endpoint: { method: httpMethod, path },
      category: "status-semantics",
      statement: "Business errors are returned as non-2xx HTTP status codes",
      source: {
        section: "Response",
        excerpt: "Errors are returned as HTTP 4xx/5xx",
      },
      confidence: 0.8,
      validationPredicate: "rejected business outcome must not be HTTP 200 with error body",
    });
  }

  if (/bearer|x-api-key|api.key|auth/i.test(input.documentation)) {
    expectations.push({
      id: generateId("EXP"),
      endpoint: { method: httpMethod, path },
      category: "authentication",
      statement: "Requests must authenticate as documented",
      source: {
        section: "Authentication",
        excerpt: "auth",
      },
      confidence: 0.75,
      validationPredicate: "documented auth method is accepted by runtime",
    });
  }

  if (/paginat|totalpages|\?page=|cursor/i.test(input.documentation)) {
    expectations.push({
      id: generateId("EXP"),
      endpoint: { method: "GET", path: path.includes("{") ? path : path },
      category: "pagination",
      statement: "List endpoints follow documented pagination contract",
      source: {
        section: "Pagination",
        excerpt: "pagination",
      },
      confidence: 0.8,
      validationPredicate: "response pagination fields match documented model",
    });
  }

  return expectations;
}

export async function runDocsAnalystAgent(
  input: DocsAnalystInput
): Promise<{ expectations: DocumentedExpectation[]; source: "llm" | "deterministic" }> {
  const fallback = extractExpectationsDeterministic(input);
  if (!input.useLlm || !isLlmAvailable()) {
    return { expectations: fallback, source: "deterministic" };
  }

  const result = await structuredCompletion({
    schema: LlmEnvelope,
    instructionVersion: DOCS_ANALYST_VERSION,
    messages: [
      {
        role: "system",
        content:
          "Extract documented expectations only. Return JSON { expectations: [...] }. Never assert runtime behavior.",
      },
      {
        role: "user",
        content: `Goal: ${input.goal}\n\nDocs:\n${input.documentation.slice(0, 8000)}`,
      },
    ],
  });

  if (!result.ok || result.data.expectations.length === 0) {
    return { expectations: fallback, source: "deterministic" };
  }
  return { expectations: result.data.expectations, source: "llm" };
}
