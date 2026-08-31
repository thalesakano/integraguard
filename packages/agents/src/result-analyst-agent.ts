import { generateId, type ContractDrift, type DocumentedExpectation } from "@integraguard/schemas";
import { diffShapes, normalizeToShape } from "@integraguard/tools";
import { z } from "zod";
import { isLlmAvailable } from "./llm-client.js";
import { structuredCompletion } from "./structured-completion.js";
import { extractRequiredFieldHint } from "./probe-designer-agent.js";

export const RESULT_ANALYST_VERSION = "v2";

export type ResultAnalystDecision =
  | { kind: "match"; expectationId: string; summary: string }
  | { kind: "mismatch"; drift: ContractDrift; needsAdditionalProbe: false }
  | {
      kind: "inconclusive";
      expectationId: string;
      reason: string;
      needsAdditionalProbe: boolean;
      suggestedProbePurpose?: string;
    };

export interface ResultAnalystInput {
  expectation: DocumentedExpectation;
  observation: {
    probeId: string;
    statusCode: number;
    body: unknown;
    error?: string;
    durationMs: number;
  };
  remainingBudget: number;
  useLlm?: boolean;
}

const LlmDecisionSchema = z.object({
  kind: z.enum(["match", "mismatch", "inconclusive"]),
  summary: z.string(),
  driftType: z
    .enum([
      "required-field-added",
      "field-removed",
      "field-renamed",
      "type-changed",
      "response-shape-changed",
      "status-semantics-changed",
      "auth-changed",
      "idempotency-broken",
      "pagination-changed",
      "endpoint-missing",
    ])
    .optional(),
  needsAdditionalProbe: z.boolean().default(false),
});

function hasControlledAuthComparison(expectation: DocumentedExpectation): boolean {
  return expectation.metadata?.controlledAuthComparison === true;
}

export function analyzeResultDeterministic(input: ResultAnalystInput): ResultAnalystDecision {
  const { expectation, observation, remainingBudget } = input;

  if (observation.error || observation.statusCode === 0) {
    return {
      kind: "inconclusive",
      expectationId: expectation.id,
      reason: observation.error ?? "No HTTP response",
      needsAdditionalProbe: remainingBudget > 0,
      suggestedProbePurpose: remainingBudget > 0 ? "Retry probe after transport failure" : undefined,
    };
  }

  if (expectation.category === "status-semantics") {
    const body = observation.body as Record<string, unknown> | null;
    if (
      observation.statusCode === 200 &&
      body &&
      (body.businessStatus === "error" ||
        body.status === "rejected" ||
        body.settlementState === "DECLINED")
    ) {
      return {
        kind: "mismatch",
        drift: {
          id: generateId("DRIFT"),
          expectationId: expectation.id,
          type: "status-semantics-changed",
          status: "candidate",
          evidenceIds: [],
          summary:
            "Documented non-2xx errors, but runtime returned HTTP 200 with business rejection payload",
        },
        needsAdditionalProbe: false,
      };
    }
  }

  // Isolated 401 is inconclusive unless expectation declares a controlled auth comparison.
  if (expectation.category === "authentication" && observation.statusCode === 401) {
    if (!hasControlledAuthComparison(expectation)) {
      return {
        kind: "inconclusive",
        expectationId: expectation.id,
        reason:
          "Isolated HTTP 401 is not sufficient for auth drift — need controlled auth comparison",
        needsAdditionalProbe: remainingBudget > 0,
        suggestedProbePurpose:
          remainingBudget > 0
            ? "Controlled auth comparison (documented credentials vs alternate)"
            : undefined,
      };
    }
    return {
      kind: "mismatch",
      drift: {
        id: generateId("DRIFT"),
        expectationId: expectation.id,
        type: "auth-changed",
        status: "candidate",
        evidenceIds: [],
        summary: "Authentication diverged under controlled auth comparison (HTTP 401)",
      },
      needsAdditionalProbe: false,
    };
  }

  if (expectation.category === "request-schema" && observation.statusCode === 400) {
    const field = extractRequiredFieldHint(observation.body);
    if (field && remainingBudget > 0) {
      return {
        kind: "inconclusive",
        expectationId: expectation.id,
        reason: `HTTP 400 indicates required field "${field}" — counterprobe needed`,
        needsAdditionalProbe: true,
        suggestedProbePurpose: `Counterprobe fill required field ${field}`,
      };
    }
    const diffs = diffShapes(
      normalizeToShape(expectation.source.excerpt),
      normalizeToShape(observation.body)
    );
    return {
      kind: "mismatch",
      drift: {
        id: generateId("DRIFT"),
        expectationId: expectation.id,
        type: diffs[0]?.kind === "required-field-added" ? "required-field-added" : "response-shape-changed",
        status: "candidate",
        evidenceIds: [],
        summary: `Request schema mismatch: HTTP 400 — ${JSON.stringify(observation.body).slice(0, 120)}`,
      },
      needsAdditionalProbe: false,
    };
  }

  if (observation.statusCode === 404) {
    return {
      kind: "mismatch",
      drift: {
        id: generateId("DRIFT"),
        expectationId: expectation.id,
        type: "endpoint-missing",
        status: "candidate",
        evidenceIds: [],
        summary: "Documented endpoint returned 404",
      },
      needsAdditionalProbe: false,
    };
  }

  if (observation.statusCode >= 200 && observation.statusCode < 300) {
    return {
      kind: "match",
      expectationId: expectation.id,
      summary: `HTTP ${observation.statusCode} consistent with probe for ${expectation.category}`,
    };
  }

  return {
    kind: "inconclusive",
    expectationId: expectation.id,
    reason: `Ambiguous status ${observation.statusCode}`,
    needsAdditionalProbe: remainingBudget > 0,
    suggestedProbePurpose: remainingBudget > 0 ? "Follow-up probe to disambiguate" : undefined,
  };
}

export async function runResultAnalystAgent(
  input: ResultAnalystInput
): Promise<{ decision: ResultAnalystDecision; source: "llm" | "deterministic" }> {
  const fallback = analyzeResultDeterministic(input);
  // Agent must never mark verified — only candidate/inconclusive/match
  if (fallback.kind === "mismatch") {
    fallback.drift.status = "candidate";
  }

  if (!input.useLlm || !isLlmAvailable()) {
    return { decision: fallback, source: "deterministic" };
  }

  const result = await structuredCompletion({
    schema: LlmDecisionSchema,
    instructionVersion: RESULT_ANALYST_VERSION,
    messages: [
      {
        role: "system",
        content:
          "Compare documented expectation vs observation. Never set status verified. Isolated 401 without controlledAuthComparison is inconclusive. Return JSON decision.",
      },
      {
        role: "user",
        content: JSON.stringify({
          expectation: input.expectation,
          observation: input.observation,
        }),
      },
    ],
  });

  if (!result.ok) return { decision: fallback, source: "deterministic" };

  if (result.data.kind === "mismatch" && result.data.driftType) {
    // Never promote isolated 401 to auth-changed without controlled comparison metadata
    if (
      result.data.driftType === "auth-changed" &&
      !hasControlledAuthComparison(input.expectation)
    ) {
      return {
        source: "llm",
        decision: {
          kind: "inconclusive",
          expectationId: input.expectation.id,
          reason: result.data.summary || "Isolated auth failure without controlled comparison",
          needsAdditionalProbe: result.data.needsAdditionalProbe && input.remainingBudget > 0,
        },
      };
    }
    return {
      source: "llm",
      decision: {
        kind: "mismatch",
        needsAdditionalProbe: false,
        drift: {
          id: generateId("DRIFT"),
          expectationId: input.expectation.id,
          type: result.data.driftType,
          status: "candidate",
          evidenceIds: [],
          summary: result.data.summary,
        },
      },
    };
  }

  if (result.data.kind === "inconclusive") {
    return {
      source: "llm",
      decision: {
        kind: "inconclusive",
        expectationId: input.expectation.id,
        reason: result.data.summary,
        needsAdditionalProbe: result.data.needsAdditionalProbe && input.remainingBudget > 0,
      },
    };
  }

  return {
    source: "llm",
    decision: {
      kind: "match",
      expectationId: input.expectation.id,
      summary: result.data.summary,
    },
  };
}
