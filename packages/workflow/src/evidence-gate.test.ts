import { describe, expect, it } from "vitest";
import { runEvidenceGate, buildReadinessPack } from "./evidence-gate.js";

describe("Evidence Gate fail-closed", () => {
  it("critical requirement without evidence cannot be READY", () => {
    const result = runEvidenceGate({
      findings: [],
      evidences: [],
      requirements: [
        {
          id: "REQ-CRIT",
          description: "Must validate authentication contract",
          severity: "critical",
        },
      ],
    });

    expect(result.decision).not.toBe("READY");
    expect(result.unansweredQuestions).toHaveLength(1);
    expect(result.readinessScore).toBeLessThan(100);
  });

  it("verified critical drift remains BLOCKED", () => {
    const result = runEvidenceGate({
      findings: [
        {
          id: "F1",
          requirementId: "REQ-CRIT",
          severity: "critical",
          status: "unverified",
          description: "schema mismatch",
          evidenceIds: ["ev1"],
          blockerType: "undocumented-required-field",
        },
      ],
      evidences: [
        {
          id: "ev1",
          type: "http_probe",
          sourceReference: "probe:1",
          observation: "sku is required",
          payload: { statusCode: 400 },
        },
      ],
      requirements: [
        { id: "REQ-CRIT", description: "orders", severity: "critical" },
      ],
    });
    expect(result.decision).toBe("BLOCKED");
    expect(result.verifiedFindings).toHaveLength(1);
  });

  it("pack inherits fail-closed decision", () => {
    const gate = runEvidenceGate({
      findings: [],
      evidences: [],
      requirements: [{ id: "REQ-1", description: "x", severity: "critical" }],
    });
    const pack = buildReadinessPack("run1", gate, gate.unansweredQuestions.length
      ? [{ id: "REQ-1", description: "x", severity: "critical" }]
      : [], [], [], []);
    expect(pack.decision).not.toBe("READY");
  });
});
