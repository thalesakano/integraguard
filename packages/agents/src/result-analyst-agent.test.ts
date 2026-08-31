import { describe, it, expect } from "vitest";
import { analyzeResultDeterministic } from "./result-analyst-agent.js";
import type { DocumentedExpectation } from "@integraguard/schemas";

const baseExp = (
  category: DocumentedExpectation["category"],
  extra?: Partial<DocumentedExpectation>
): DocumentedExpectation => ({
  id: "EXP-1",
  endpoint: { method: "POST", path: "/v1/x" },
  category,
  statement: "test",
  source: { section: "s", excerpt: "e" },
  confidence: 0.8,
  validationPredicate: "p",
  ...extra,
});

describe("result-analyst-agent", () => {
  it("produces candidate mismatch for structural/status drift", () => {
    const decision = analyzeResultDeterministic({
      expectation: baseExp("status-semantics"),
      observation: {
        probeId: "p1",
        statusCode: 200,
        body: { businessStatus: "error", status: "rejected" },
        durationMs: 5,
      },
      remainingBudget: 2,
    });
    expect(decision.kind).toBe("mismatch");
    if (decision.kind === "mismatch") {
      expect(decision.drift.status).toBe("candidate");
      expect(decision.drift.type).toBe("status-semantics-changed");
    }
  });

  it("marks timeout as inconclusive", () => {
    const decision = analyzeResultDeterministic({
      expectation: baseExp("request-schema"),
      observation: { probeId: "p1", statusCode: 0, body: null, error: "aborted", durationMs: 1 },
      remainingBudget: 1,
    });
    expect(decision.kind).toBe("inconclusive");
  });

  it("requests additional probe when budget remains on ambiguous result", () => {
    const decision = analyzeResultDeterministic({
      expectation: baseExp("request-schema"),
      observation: { probeId: "p1", statusCode: 503, body: { retry: true }, durationMs: 1 },
      remainingBudget: 2,
    });
    expect(decision.kind).toBe("inconclusive");
    if (decision.kind === "inconclusive") {
      expect(decision.needsAdditionalProbe).toBe(true);
    }
  });

  it("stays inconclusive when budget exhausted", () => {
    const decision = analyzeResultDeterministic({
      expectation: baseExp("request-schema"),
      observation: { probeId: "p1", statusCode: 503, body: {}, durationMs: 1 },
      remainingBudget: 0,
    });
    if (decision.kind === "inconclusive") {
      expect(decision.needsAdditionalProbe).toBe(false);
    }
  });

  it("isolated 401 is inconclusive without controlled auth comparison", () => {
    const decision = analyzeResultDeterministic({
      expectation: baseExp("authentication"),
      observation: { probeId: "p1", statusCode: 401, body: { error: "nope" }, durationMs: 1 },
      remainingBudget: 0,
    });
    expect(decision.kind).toBe("inconclusive");
  });

  it("401 with controlledAuthComparison metadata can be auth-changed candidate", () => {
    const decision = analyzeResultDeterministic({
      expectation: baseExp("authentication", {
        metadata: { controlledAuthComparison: true },
      }),
      observation: { probeId: "p1", statusCode: 401, body: { error: "nope" }, durationMs: 1 },
      remainingBudget: 0,
    });
    expect(decision.kind).toBe("mismatch");
    if (decision.kind === "mismatch") {
      expect(decision.drift.type).toBe("auth-changed");
      expect(decision.drift.status).not.toBe("verified");
    }
  });

  it("400 with required-field hint requests counterprobe when budget remains", () => {
    const decision = analyzeResultDeterministic({
      expectation: baseExp("request-schema"),
      observation: {
        probeId: "p1",
        statusCode: 400,
        body: { error: "sku is required" },
        durationMs: 1,
      },
      remainingBudget: 2,
    });
    expect(decision.kind).toBe("inconclusive");
    if (decision.kind === "inconclusive") {
      expect(decision.needsAdditionalProbe).toBe(true);
      expect(decision.suggestedProbePurpose?.toLowerCase()).toContain("counterprobe");
    }
  });
});
