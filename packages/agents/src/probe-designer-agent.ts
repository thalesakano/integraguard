import { generateId, type DocumentedExpectation, type ProbePlan } from "@integraguard/schemas";
import { evaluateProbePolicy } from "@integraguard/tools";
import { z } from "zod";
import { isLlmAvailable } from "./llm-client.js";
import { structuredCompletion } from "./structured-completion.js";

export const PROBE_DESIGNER_VERSION = "v2";

export interface ProbeDesignerInput {
  expectations: DocumentedExpectation[];
  sampleRequest?: unknown;
  sandboxUrl: string;
  allowedHosts?: string[];
  allowedOperations?: string[];
  targetMode?: "sandbox" | "custom" | "real-api" | "docs-url";
  remainingBudget: number;
  useLlm?: boolean;
  /** Previous observation summary — used for counterprobes */
  previousObservation?: {
    statusCode?: number;
    body?: unknown;
    expectationId?: string;
    probeId?: string;
  };
}

const ProposedProbeSchema = z.object({
  probes: z.array(
    z.object({
      method: z.string(),
      endpoint: z.string(),
      purpose: z.string(),
      sideEffectRisk: z.enum(["low", "medium", "high"]),
      requiresApproval: z.boolean(),
      expectedEvidence: z.string(),
      expectationId: z.string().optional(),
      body: z.unknown().optional(),
      headers: z.record(z.string()).optional(),
    })
  ),
});

/** Extract a required-field name from common API error messages. */
export function extractRequiredFieldHint(body: unknown): string | undefined {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  const patterns = [
    /["']?([a-zA-Z_][\w]*)["']?\s+is\s+required/i,
    /required\s+(?:field|parameter)[:\s]+["']?([a-zA-Z_][\w]*)/i,
    /missing\s+(?:required\s+)?(?:field\s+)?["']?([a-zA-Z_][\w]*)/i,
    /["']([a-zA-Z_][\w]*)["']\s+required/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

function baseBody(sample: unknown): Record<string, unknown> {
  if (sample && typeof sample === "object" && !Array.isArray(sample)) {
    return { ...(sample as Record<string, unknown>) };
  }
  return {};
}

export function designProbesDeterministic(input: ProbeDesignerInput): ProbePlan[] {
  const plans: ProbePlan[] = [];
  const catalog = new Set(
    input.expectations.map((e) => `${e.endpoint.method.toUpperCase()} ${e.endpoint.path}`)
  );
  const ops = input.allowedOperations ?? ["GET", "POST"];
  let budget = input.remainingBudget;

  const prev = input.previousObservation;
  const requiredField =
    prev?.statusCode === 400 ? extractRequiredFieldHint(prev.body) : undefined;

  for (const exp of input.expectations) {
    if (budget <= 0) break;
    const method = exp.endpoint.method.toUpperCase();
    const path = exp.endpoint.path;
    const key = `${method} ${path}`;
    if (!catalog.has(key)) continue;

    // When counterprobing, focus on the linked expectation
    if (prev?.expectationId && requiredField && exp.id !== prev.expectationId) {
      continue;
    }

    const url = new URL(
      path.replace(/^\//, ""),
      input.sandboxUrl.endsWith("/") ? input.sandboxUrl : input.sandboxUrl + "/"
    ).toString();
    const policy = evaluateProbePolicy({
      method,
      url,
      allowedHosts: input.allowedHosts ?? [new URL(input.sandboxUrl).hostname],
      allowedOperations: ops,
      targetMode: input.targetMode,
      remainingBudget: budget,
    });
    if (policy.action === "block" || policy.action === "inconclusive") continue;

    const expectedEvidence = `HTTP response supporting: ${exp.statement}`;

    // Adaptive counterprobe: 400 + required field → fill safe placeholder
    if (prev?.statusCode === 400 && requiredField && budget > 0) {
      const body = baseBody(input.sampleRequest);
      body[requiredField] = `integraguard-placeholder-${requiredField}`;
      plans.push({
        id: generateId("probe"),
        method,
        endpoint: path,
        purpose: `Counterprobe after schema 400 — fill required field ${requiredField}`,
        sideEffectRisk: "low",
        requiresApproval: policy.action === "require-approval",
        body,
        expectationId: exp.id,
        expectedEvidence,
        attempt: 2,
        retryOfProbeId: prev.probeId,
      });
      budget--;
      continue;
    }

    // Transport / 5xx retry with distinct attempt so dedupe keeps it
    if (
      prev &&
      (prev.statusCode === 0 || (prev.statusCode !== undefined && prev.statusCode >= 500)) &&
      (!prev.expectationId || prev.expectationId === exp.id) &&
      budget > 0
    ) {
      plans.push({
        id: generateId("probe"),
        method,
        endpoint: path,
        purpose: `Retry probe after transport/5xx failure (attempt 2)`,
        sideEffectRisk: policy.risk === "safe" ? "low" : "medium",
        requiresApproval: policy.action === "require-approval",
        body: method === "GET" ? undefined : (input.sampleRequest ?? {}),
        headers:
          exp.category === "idempotency"
            ? { "Idempotency-Key": "integraguard-idem-test" }
            : undefined,
        expectationId: exp.id,
        expectedEvidence,
        attempt: 2,
        retryOfProbeId: prev.probeId,
      });
      budget--;
      continue;
    }

    const plan: ProbePlan = {
      id: generateId("probe"),
      method,
      endpoint: path,
      purpose: `Validate ${exp.category}: ${exp.statement}`,
      sideEffectRisk: policy.risk === "safe" ? "low" : "medium",
      requiresApproval: policy.action === "require-approval",
      body: method === "GET" ? undefined : (input.sampleRequest ?? {}),
      headers:
        exp.category === "idempotency"
          ? { "Idempotency-Key": "integraguard-idem-test" }
          : undefined,
      expectationId: exp.id,
      expectedEvidence,
      attempt: 1,
    };
    plans.push(plan);
    budget--;

    if (exp.category === "idempotency" && budget > 0) {
      plans.push({
        ...plan,
        id: generateId("probe"),
        purpose: "Verify idempotency — duplicate submission",
        requiresApproval: true,
        sideEffectRisk: "medium",
        headers: { "Idempotency-Key": "integraguard-idem-test" },
        expectationId: exp.id,
        expectedEvidence,
        attempt: 1,
      });
      budget--;
    }
  }

  return plans;
}

export async function runProbeDesignerAgent(
  input: ProbeDesignerInput
): Promise<{ plans: ProbePlan[]; source: "llm" | "deterministic" }> {
  const fallback = designProbesDeterministic(input);
  if (!input.useLlm || !isLlmAvailable()) {
    return { plans: fallback, source: "deterministic" };
  }

  const result = await structuredCompletion({
    schema: ProposedProbeSchema,
    instructionVersion: PROBE_DESIGNER_VERSION,
    messages: [
      {
        role: "system",
        content:
          "Design minimal probes from documented expectations. Never invent endpoints outside the catalog. Set expectationId on every probe. Return JSON { probes: [...] }.",
      },
      {
        role: "user",
        content: JSON.stringify({
          expectations: input.expectations,
          budget: input.remainingBudget,
          previous: input.previousObservation,
        }),
      },
    ],
  });

  if (!result.ok) return { plans: fallback, source: "deterministic" };

  const catalog = new Set(
    input.expectations.map((e) => `${e.endpoint.method.toUpperCase()} ${e.endpoint.path}`)
  );
  const byId = new Map(input.expectations.map((e) => [e.id, e]));
  const plans: ProbePlan[] = [];
  for (const p of result.data.probes) {
    const key = `${p.method.toUpperCase()} ${p.endpoint}`;
    if (!catalog.has(key)) continue;
    const url = new URL(
      p.endpoint.replace(/^\//, ""),
      input.sandboxUrl.endsWith("/") ? input.sandboxUrl : input.sandboxUrl + "/"
    ).toString();
    const policy = evaluateProbePolicy({
      method: p.method,
      url,
      allowedHosts: input.allowedHosts ?? [new URL(input.sandboxUrl).hostname],
      allowedOperations: input.allowedOperations ?? ["GET", "POST"],
      targetMode: input.targetMode,
      remainingBudget: input.remainingBudget - plans.length,
    });
    if (policy.action === "block" || policy.action === "inconclusive") continue;
    const expectationId =
      p.expectationId && byId.has(p.expectationId)
        ? p.expectationId
        : input.expectations.find(
            (e) =>
              e.endpoint.path === p.endpoint &&
              e.endpoint.method.toUpperCase() === p.method.toUpperCase()
          )?.id;
    plans.push({
      id: generateId("probe"),
      method: p.method.toUpperCase(),
      endpoint: p.endpoint,
      purpose: `${p.purpose} | expected: ${p.expectedEvidence}`,
      sideEffectRisk: p.sideEffectRisk,
      requiresApproval: policy.action === "require-approval" || p.requiresApproval,
      body: p.body,
      headers: p.headers,
      expectationId,
      expectedEvidence: p.expectedEvidence,
      attempt: 1,
    });
  }

  return { plans: plans.length ? plans : fallback, source: plans.length ? "llm" : "deterministic" };
}
