import { describe, expect, it } from "vitest";
import { buildVendorIssue, buildVendorEmail } from "./index.js";
import type { ReadinessPack } from "@integraguard/schemas";

function samplePack(overrides: Partial<ReadinessPack> = {}): ReadinessPack {
  return {
    runId: "run_test",
    decision: "BLOCKED",
    readinessScore: 40,
    requirements: [{ id: "REQ-001", description: "customerId required", severity: "critical" }],
    findings: [
      {
        id: "F-1",
        requirementId: "REQ-001",
        severity: "critical",
        status: "verified",
        description: "Runtime requires sku but docs only document customerId",
        evidenceIds: ["ev_http_1", "ev_doc_1"],
        blockerType: "undocumented-required-field",
      },
    ],
    evidences: [],
    unansweredQuestions: [],
    mappings: [
      {
        requirementId: "REQ-001",
        method: "POST",
        endpoint: "/v1/orders",
        source: { file: "api-docs.md", section: "Create order" },
        confidence: 0.9,
      },
    ],
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("buildVendorIssue", () => {
  it("produces neutral issue with endpoint, evidence, and objective question", () => {
    const md = buildVendorIssue(samplePack());
    expect(md).toMatch(/Contract drift detected/i);
    expect(md).not.toMatch(/\bfalsif|\blie\b|fraud|you broke/i);
    expect(md).toContain("POST /v1/orders");
    expect(md).toContain("ev_http_1");
    expect(md).toContain("canonical contract");
    expect(md).toContain("undocumented-required-field");
    expect(md).toContain("run_test");
  });

  it("skips finding sections when no verified drifts", () => {
    const md = buildVendorIssue(
      samplePack({
        findings: [
          {
            id: "F-2",
            requirementId: "REQ-001",
            severity: "major",
            status: "unverified",
            description: "candidate only",
            evidenceIds: [],
          },
        ],
        decision: "READY",
        readinessScore: 100,
      })
    );
    expect(md).toContain("READY");
    expect(md).not.toContain("###");
  });
});

describe("buildVendorEmail", () => {
  it("asks clarifying questions without accusatory language", () => {
    const email = buildVendorEmail(samplePack());
    expect(email).toMatch(/contract-drift/i);
    expect(email).toContain("Which fields are required");
    expect(email).not.toMatch(/you lied|broken API|incompetent/i);
  });
});
