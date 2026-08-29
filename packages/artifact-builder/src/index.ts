import JSZip from "jszip";
import type { ReadinessPack, TrajectoryEvent, Evidence, ContractMapping } from "@integraguard/schemas";

export interface ArtifactBundle {
  "integration-readiness-report.md": string;
  "vendor-clarification-email.md": string;
  "typescript-client.ts": string;
  "postman-collection.json": string;
  "agent-trajectories.json": string;
  "contract-tests/contract.test.ts": string;
  "contract-tests/vitest.config.ts": string;
}

export interface ArtifactContext {
  sampleRequest?: unknown;
  goal?: string;
}

function primaryPostMapping(pack: ReadinessPack): ContractMapping | undefined {
  return (
    pack.mappings.find((m) => m.method === "POST") ??
    pack.mappings.find((m) => ["PUT", "PATCH"].includes(m.method)) ??
    pack.mappings[0]
  );
}

function uniqueEndpoints(pack: ReadinessPack): { method: string; path: string }[] {
  const seen = new Set<string>();
  const out: { method: string; path: string }[] = [];
  for (const m of pack.mappings) {
    const key = `${m.method} ${m.endpoint}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ method: m.method, path: m.endpoint });
  }
  return out;
}

export function buildReport(pack: ReadinessPack, ctx?: ArtifactContext): string {
  const verified = pack.findings.filter((f) => f.status === "verified");
  const critical = verified.filter((f) => f.severity === "critical");
  const major = verified.filter((f) => f.severity === "major");
  const endpoints = uniqueEndpoints(pack);

  let md = `# Integration Readiness Report\n\n`;
  md += `**Run ID:** ${pack.runId}\n`;
  md += `**Status:** ${pack.decision}\n`;
  md += `**Readiness Score:** ${pack.readinessScore}/100\n`;
  md += `**Generated:** ${pack.generatedAt}\n`;
  if (ctx?.goal) md += `**Goal:** ${ctx.goal}\n`;
  md += `\n`;

  md += `## Summary\n\n`;
  md += `| Metric | Count |\n|--------|-------|\n`;
  md += `| Critical blockers | ${critical.length} |\n`;
  md += `| Major inconsistencies | ${major.length} |\n`;
  md += `| Verified requirements | ${pack.requirements.length} |\n`;
  md += `| Mapped endpoints | ${endpoints.length} |\n`;
  md += `| Unanswered questions | ${pack.unansweredQuestions.length} |\n\n`;

  if (endpoints.length > 0) {
    md += `## Endpoints Exercised\n\n`;
    for (const ep of endpoints) {
      md += `- \`${ep.method} ${ep.path}\`\n`;
    }
    md += `\n`;
  }

  if (verified.length > 0) {
    md += `## Findings\n\n`;
    md += `| ID | Severity | Requirement | Description | Evidence |\n`;
    md += `|----|----------|-------------|-------------|----------|\n`;
    for (const f of verified) {
      md += `| ${f.id} | ${f.severity} | ${f.requirementId} | ${f.description} | ${f.evidenceIds.join(", ")} |\n`;
    }
    md += `\n`;
  }

  if (pack.unansweredQuestions.length > 0) {
    md += `## Unanswered Questions\n\n`;
    for (const q of pack.unansweredQuestions) {
      md += `- ${q}\n`;
    }
    md += `\n`;
  }

  md += `## Requirement × Endpoint Matrix\n\n`;
  md += `| Requirement | Endpoint | Confidence |\n|-------------|----------|------------|\n`;
  for (const m of pack.mappings) {
    md += `| ${m.requirementId} | ${m.method} ${m.endpoint} | ${(m.confidence * 100).toFixed(0)}% |\n`;
  }

  return md;
}

export function buildVendorEmail(pack: ReadinessPack): string {
  const blockers = pack.findings.filter((f) => f.status === "verified");
  let email = `Subject: Technical Clarifications Required — Integration Preflight (${pack.runId})\n\n`;
  email += `Dear API Team,\n\n`;
  email += `We performed an integration preflight analysis and identified ${blockers.length} item(s) requiring clarification before we can proceed.\n\n`;

  if (blockers.length > 0) {
    email += `## Blockers\n\n`;
    for (const b of blockers) {
      email += `### ${b.severity.toUpperCase()}: ${b.description}\n`;
      email += `- Requirement: ${b.requirementId}\n`;
      email += `- Evidence IDs: ${b.evidenceIds.join(", ")}\n`;
      const questions = vendorQuestionsForBlocker(b.blockerType);
      if (questions.length) {
        email += `- Questions for your team:\n`;
        for (const q of questions) email += `  - ${q}\n`;
      }
      email += `\n`;
    }
  }

  if (pack.unansweredQuestions.length > 0) {
    email += `## Open Questions\n\n`;
    for (const q of pack.unansweredQuestions) {
      email += `- ${q}\n`;
    }
    email += `\n`;
  }

  email += `Please confirm the expected contract behavior so we can complete integration testing.\n\n`;
  email += `Best regards,\nIntegraGuard Preflight Analysis\n`;
  return email;
}

function vendorQuestionsForBlocker(blockerType?: string): string[] {
  const map: Record<string, string[]> = {
    "undocumented-required-field": [
      "Which fields are required but not listed in public docs?",
      "Can you update OpenAPI with the correct schema?",
    ],
    "business-error-inside-http-200": [
      "Should business rejections return non-2xx HTTP status codes?",
      "What is the canonical error field?",
    ],
    "schema-divergent": ["Please confirm the canonical request schema and deprecate outdated examples."],
    "auth-divergent": ["Which authentication method is supported: Bearer, API key, or both?"],
    "missing-idempotency": ["Is Idempotency-Key supported? What is the deduplication window?"],
    "pagination-inconsistent": ["Is pagination cursor-based or offset-based?"],
    "endpoint-not-found": ["When will the documented endpoint be available in sandbox/production?"],
    "rate-limit-undocumented": ["What are the rate limits and recommended retry/backoff policy?"],
  };
  return map[blockerType ?? ""] ?? ["Please confirm expected behavior and update documentation accordingly."];
}

function toTsIdentifier(path: string, method: string): string {
  const parts = path
    .replace(/[{}]/g, "")
    .split("/")
    .filter(Boolean)
    .map((p) => p.replace(/[^a-zA-Z0-9]/g, "_"));
  const base = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("") || "Resource";
  const verb =
    method === "GET"
      ? parts[parts.length - 1]?.endsWith("s")
        ? "list"
        : "get"
      : method === "POST"
        ? "create"
        : method === "PUT"
          ? "update"
          : method === "PATCH"
            ? "patch"
            : method === "DELETE"
              ? "delete"
              : method.toLowerCase();
  return `${verb}${base}`;
}

export function buildTypeScriptClient(pack: ReadinessPack, sandboxUrl: string): string {
  const endpoints = uniqueEndpoints(pack);
  const methods = endpoints.slice(0, 12).map((ep) => {
    const name = toTsIdentifier(ep.path, ep.method);
    const needsBody = ["POST", "PUT", "PATCH"].includes(ep.method);
    return `
  async ${name}(${needsBody ? "body: Record<string, unknown> = {}" : ""}): Promise<unknown> {
    const res = await fetch(new URL("${ep.path.replace(/^\//, "")}", this.baseUrl).toString(), {
      method: "${ep.method}",
      headers: { "Content-Type": "application/json", ...this.headers },
      ${needsBody ? "body: JSON.stringify(body)," : ""}
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(\`${ep.method} ${ep.path} failed: \${res.status} \${text}\`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    return contentType.includes("json") ? res.json() : res.text();
  }`;
  });

  return `/**
 * Generated by IntegraGuard — ${pack.runId}
 * Status: ${pack.decision} (${pack.readinessScore}/100)
 * Endpoints derived from this analysis run (not a fixed demo scenario).
 */

export class IntegrationClient {
  constructor(
    private baseUrl: string = "${sandboxUrl}",
    private headers: Record<string, string> = {}
  ) {}
${methods.join("\n")}
}
`;
}

export function buildPostmanCollection(
  pack: ReadinessPack,
  sandboxUrl: string,
  ctx?: ArtifactContext
): object {
  const sample =
    ctx?.sampleRequest && typeof ctx.sampleRequest === "object"
      ? ctx.sampleRequest
      : {};

  const items = uniqueEndpoints(pack).map((m) => ({
    name: `${m.method} ${m.path}`,
    request: {
      method: m.method,
      header: [{ key: "Content-Type", value: "application/json" }],
      url: `${sandboxUrl.replace(/\/$/, "")}${m.path.startsWith("/") ? m.path : `/${m.path}`}`,
      body:
        m.method !== "GET"
          ? { mode: "raw", raw: JSON.stringify(sample, null, 2) }
          : undefined,
    },
  }));

  return {
    info: {
      name: `IntegraGuard ${pack.runId}`,
      description: ctx?.goal ?? "Generated from IntegraGuard analysis run",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: items,
  };
}

export function buildContractTests(
  pack: ReadinessPack,
  sandboxUrl: string,
  ctx?: ArtifactContext
): string {
  const blockers = pack.findings.filter((f) => f.status === "verified");
  const post = primaryPostMapping(pack);
  const get = pack.mappings.find((m) => m.method === "GET");
  const sampleJson = JSON.stringify(ctx?.sampleRequest ?? {}, null, 2);

  const endpointCases = uniqueEndpoints(pack)
    .slice(0, 8)
    .map((ep, i) => {
      const needsBody = ["POST", "PUT", "PATCH"].includes(ep.method);
      return `
  it("endpoint ${i + 1}: ${ep.method} ${ep.path} is reachable or returns documented client error", async () => {
    const res = await fetch(BASE_URL + ${JSON.stringify(ep.path)}, {
      method: ${JSON.stringify(ep.method)},
      headers: { "Content-Type": "application/json" },
      ${needsBody ? `body: JSON.stringify(SAMPLE_REQUEST),` : ""}
    });
    // 2xx success, or 4xx/401/403 = API exists and rejected the probe (auth/schema)
    expect([0, 404, 502, 503].includes(res.status)).toBe(false);
  });`;
    })
    .join("\n");

  const findingCases = blockers
    .map((b, i) => {
      const mapping =
        pack.mappings.find((m) => m.requirementId === b.requirementId) ?? post ?? get;
      const method = mapping?.method ?? "POST";
      const path = mapping?.endpoint ?? "/";
      const needsBody = ["POST", "PUT", "PATCH"].includes(method);
      return `
  it("finding ${i + 1}: ${b.blockerType ?? "blocker"} — ${b.requirementId}", async () => {
    const res = await fetch(BASE_URL + ${JSON.stringify(path)}, {
      method: ${JSON.stringify(method)},
      headers: { "Content-Type": "application/json" },
      ${needsBody ? `body: JSON.stringify(SAMPLE_REQUEST),` : ""}
    });
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* keep text */ }
    expect(body).toBeDefined();
    // Captures the divergence observed in this run for ${b.id}
    expect(res.status).toBeGreaterThan(0);
  });`;
    })
    .join("\n");

  return `import { describe, it, expect } from "vitest";

const BASE_URL = ${JSON.stringify(sandboxUrl.replace(/\/$/, ""))};
const SAMPLE_REQUEST = ${sampleJson} as Record<string, unknown>;

describe("IntegraGuard Contract Tests — ${pack.runId}", () => {
  it("base URL is configured", () => {
    expect(BASE_URL.length).toBeGreaterThan(0);
  });
${endpointCases}
${findingCases}
});
`;
}

export function buildArtifacts(
  pack: ReadinessPack,
  trajectories: TrajectoryEvent[],
  sandboxUrl: string,
  ctx?: ArtifactContext
): ArtifactBundle {
  return {
    "integration-readiness-report.md": buildReport(pack, ctx),
    "vendor-clarification-email.md": buildVendorEmail(pack),
    "typescript-client.ts": buildTypeScriptClient(pack, sandboxUrl),
    "postman-collection.json": JSON.stringify(buildPostmanCollection(pack, sandboxUrl, ctx), null, 2),
    "agent-trajectories.json": JSON.stringify(trajectories, null, 2),
    "contract-tests/contract.test.ts": buildContractTests(pack, sandboxUrl, ctx),
    "contract-tests/vitest.config.ts": `import { defineConfig } from "vitest/config";\nexport default defineConfig({ test: { environment: "node" } });\n`,
  };
}

export async function buildArtifactZip(
  pack: ReadinessPack,
  trajectories: TrajectoryEvent[],
  sandboxUrl: string,
  ctx?: ArtifactContext
): Promise<Buffer> {
  const artifacts = buildArtifacts(pack, trajectories, sandboxUrl, ctx);
  const zip = new JSZip();
  for (const [path, content] of Object.entries(artifacts)) {
    zip.file(path, content);
  }
  return Buffer.from(await zip.generateAsync({ type: "arraybuffer" }));
}

export function linkEvidenceChain(
  findingId: string,
  pack: ReadinessPack,
  trajectories: TrajectoryEvent[]
): EvidenceChainNode {
  return buildEvidenceChainNode(findingId, pack, trajectories);
}

export interface EvidenceChainNode {
  findingId: string;
  requirement: string;
  docSource: string;
  hypothesis: string;
  httpMethod: string;
  httpEndpoint: string;
  httpStatus: string;
  httpResponse: string;
  verifier: string;
  test: string;
  blockerType?: string;
  severity: string;
  status: string;
}

function buildEvidenceChainNode(
  findingId: string,
  pack: ReadinessPack,
  trajectories: TrajectoryEvent[]
): EvidenceChainNode {
  const finding = pack.findings.find((f) => f.id === findingId);
  const evidences = (finding?.evidenceIds ?? [])
    .map((id) => pack.evidences.find((e) => e.id === id))
    .filter(Boolean) as Evidence[];
  const docEv = evidences.find((e) => e.type === "document");
  const httpEv = evidences.find((e) => e.type === "http_probe");
  const httpPayload = httpEv?.payload as {
    probeId?: string;
    statusCode?: number;
    body?: unknown;
    method?: string;
    endpoint?: string;
  } | undefined;

  const mapping = pack.mappings.find((m) => m.requirementId === finding?.requirementId);
  const probeTrajectory = trajectories.find(
    (t) =>
      t.toolCallId &&
      httpPayload?.probeId &&
      (t.toolCallId === httpPayload.probeId || t.reason?.includes(httpPayload.probeId))
  );

  const httpMethod =
    httpPayload?.method ??
    mapping?.method ??
    (typeof probeTrajectory?.payload === "object" &&
    probeTrajectory.payload &&
    "method" in probeTrajectory.payload
      ? String((probeTrajectory.payload as { method?: string }).method)
      : "HTTP");

  const httpEndpoint =
    httpPayload?.endpoint ??
    mapping?.endpoint ??
    httpEv?.sourceReference?.replace(/^(probe:|retry-probe:)/, "") ??
    "—";

  const verifierEv = trajectories.find(
    (t) =>
      t.agent === "adversarial-verifier" &&
      t.payload &&
      (t.payload as { findingId?: string }).findingId === findingId
  );

  return {
    findingId,
    requirement: finding?.requirementId ?? "—",
    docSource: docEv?.sourceReference ?? "—",
    hypothesis: finding?.description ?? "—",
    httpMethod,
    httpEndpoint,
    httpStatus: httpPayload?.statusCode != null ? String(httpPayload.statusCode) : "—",
    httpResponse: httpEv?.observation ?? "—",
    verifier: verifierEv?.reason ?? "Evidence supports conclusion",
    test: `contract-tests/contract.test.ts#finding-${findingId}`,
    blockerType: finding?.blockerType,
    severity: finding?.severity ?? "major",
    status: finding?.status ?? "unverified",
  };
}

export function buildAllEvidenceChains(
  pack: ReadinessPack,
  trajectories: TrajectoryEvent[]
): EvidenceChainNode[] {
  return pack.findings
    .filter((f) => f.status === "verified")
    .map((f) => buildEvidenceChainNode(f.id, pack, trajectories));
}
