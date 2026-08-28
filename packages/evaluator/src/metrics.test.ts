import { describe, it, expect } from "vitest";
import { computeMetrics, evaluateCase } from "./metrics.js";
import type { GroundTruth } from "@integraguard/schemas";

describe("evaluator metrics", () => {
  const groundTruth: GroundTruth = {
    case: "authorization-07",
    expectedDecision: "BLOCKED",
    blockers: [
      { id: "BLK-001", severity: "critical", type: "undocumented-required-field" },
      { id: "BLK-002", severity: "critical", type: "business-error-inside-http-200" },
    ],
  };

  it("scores verified findings with evidence", () => {
    const findings = [
      {
        id: "F1",
        requirementId: "REQ-001",
        severity: "critical" as const,
        status: "verified" as const,
        evidenceIds: ["E1"],
        description: "Undocumented required field beneficiary_id",
        blockerType: "undocumented-required-field",
      },
      {
        id: "F2",
        requirementId: "REQ-002",
        severity: "critical" as const,
        status: "verified" as const,
        evidenceIds: ["E2"],
        description: "HTTP 200 with businessStatus error",
        blockerType: "business-error-inside-http-200",
      },
    ];
    const evidences = [
      { id: "E1", type: "http_probe" as const, sourceReference: "probe", observation: "400" },
      { id: "E2", type: "http_probe" as const, sourceReference: "probe", observation: "200 error" },
    ];
    const result = evaluateCase(groundTruth, findings, evidences, "BLOCKED");
    expect(result.metrics.weightedF1).toBeGreaterThan(0.8);
    expect(result.detectedBlockers).toHaveLength(2);
  });

  it("penalizes unsupported claims", () => {
    const findings = [
      {
        id: "F1",
        requirementId: "REQ-001",
        severity: "critical" as const,
        status: "unverified" as const,
        evidenceIds: [],
        description: "Maybe missing field",
      },
    ];
    const metrics = computeMetrics(groundTruth, findings, [], "CONDITIONAL");
    expect(metrics.unsupportedClaimRate).toBe(1);
  });
});
