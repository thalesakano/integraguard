import { describe, it, expect } from "vitest";
import { buildCiReports, buildJunitReport } from "./ci-reporters.js";
import type { ReadinessPack } from "@integraguard/schemas";

const pack: ReadinessPack = {
  runId: "run-1",
  decision: "BLOCKED",
  readinessScore: 50,
  requirements: [{ id: "REQ-001", description: "x", severity: "critical" }],
  findings: [
    {
      id: "FND-1",
      requirementId: "REQ-001",
      severity: "critical",
      status: "verified",
      evidenceIds: ["EVD-1"],
      description: "sku required but undocumented",
      blockerType: "undocumented-required-field",
    },
  ],
  evidences: [],
  unansweredQuestions: [],
  mappings: [
    {
      requirementId: "REQ-001",
      endpoint: "/v1/orders",
      method: "POST",
      source: { file: "api-docs.md" },
      confidence: 0.9,
    },
  ],
  generatedAt: new Date().toISOString(),
};

describe("ci-reporters", () => {
  it("emits junit failure for verified drift", () => {
    const xml = buildJunitReport(pack);
    expect(xml).toContain("failures=\"1\"");
    expect(xml).toContain("undocumented-required-field");
  });

  it("builds full CI bundle", () => {
    const bundle = buildCiReports(pack, []);
    expect(bundle["report.md"]).toContain("Contract Drift");
    expect(JSON.parse(bundle["report.sarif.json"]).version).toBe("2.1.0");
  });
});
