import { describe, it, expect } from "vitest";
import { buildContractTests } from "./index.js";
import type { ReadinessPack } from "@integraguard/schemas";

function packWith(
  findings: ReadinessPack["findings"],
  mappings: ReadinessPack["mappings"] = [
    {
      requirementId: "REQ-001",
      method: "POST",
      endpoint: "/v1/orders",
      source: { file: "api-docs.md", section: "Create" },
      confidence: 0.9,
    },
  ]
): ReadinessPack {
  return {
    runId: "run_gen_test",
    decision: "BLOCKED",
    readinessScore: 40,
    requirements: [{ id: "REQ-001", description: "contract", severity: "critical" }],
    findings,
    evidences: [],
    unansweredQuestions: [],
    mappings,
    generatedAt: new Date().toISOString(),
  };
}

describe("buildContractTests", () => {
  it("emits blocker-specific asserts for schema and status drifts", () => {
    const src = buildContractTests(
      packWith([
        {
          id: "F-1",
          requirementId: "REQ-001",
          severity: "critical",
          status: "verified",
          description: "undocumented required field",
          evidenceIds: ["e1"],
          blockerType: "undocumented-required-field",
        },
        {
          id: "F-2",
          requirementId: "REQ-001",
          severity: "critical",
          status: "verified",
          description: "business error in 200",
          evidenceIds: ["e2"],
          blockerType: "business-error-inside-http-200",
        },
      ]),
      "http://127.0.0.1:4000/scenarios/x/"
    );

    expect(src).toContain("toBeGreaterThanOrEqual(400)");
    expect(src).toContain('expect(res.status).toBe(200)');
    expect(src).toContain("businessStatus");
    expect(src).toContain("INTEGRAGUARD_ALLOW_MUTATION");
    expect(src).toContain("describe.skip");
  });

  it("emits 404 assert for endpoint-not-found", () => {
    const src = buildContractTests(
      packWith(
        [
          {
            id: "F-404",
            requirementId: "REQ-001",
            severity: "critical",
            status: "verified",
            description: "missing",
            evidenceIds: [],
            blockerType: "endpoint-not-found",
          },
        ],
        [
          {
            requirementId: "REQ-001",
            method: "GET",
            endpoint: "/v1/missing",
            source: { file: "api-docs.md" },
            confidence: 0.5,
          },
        ]
      ),
      "http://127.0.0.1:4000/"
    );
    expect(src).toContain("toBe(404)");
  });

  it("escapes injection in paths and run ids via JSON.stringify", () => {
    const evilPath = '/v1/x"); process.exit(1); //';
    const src = buildContractTests(
      packWith(
        [
          {
            id: "F-inj",
            requirementId: "REQ-001",
            severity: "major",
            status: "verified",
            description: "inj",
            evidenceIds: [],
            blockerType: "schema-divergent",
          },
        ],
        [
          {
            requirementId: "REQ-001",
            method: "GET",
            endpoint: evilPath,
            source: { file: "api-docs.md" },
            confidence: 0.5,
          },
        ]
      ),
      'http://evil.example/"); throw new Error("x'
    );

    expect(src).toContain(JSON.stringify(evilPath));
    expect(src).not.toMatch(/fetch\(BASE_URL \+ \/v1\/x"\)/);
    expect(src).toContain(JSON.stringify('http://evil.example/"); throw new Error("x'.replace(/\/$/, "")));
  });

  it("skips mutating describe by default", () => {
    const src = buildContractTests(
      packWith([
        {
          id: "F-1",
          requirementId: "REQ-001",
          severity: "critical",
          status: "verified",
          description: "post",
          evidenceIds: [],
          blockerType: "undocumented-required-field",
        },
      ]),
      "http://127.0.0.1:4000/"
    );
    expect(src).toMatch(/allowMutation \? describe : describe\.skip/);
  });
});
