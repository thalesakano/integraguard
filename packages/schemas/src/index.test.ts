import { describe, it, expect } from "vitest";
import { EvidenceSchema, FindingSchema, generateId } from "./index.js";

describe("schemas", () => {
  it("validates evidence", () => {
    const evidence = EvidenceSchema.parse({
      id: "EVD-001",
      type: "http_probe",
      sourceReference: "POST /v1/pre-authorization",
      observation: "API returned 400 missing beneficiary_id",
    });
    expect(evidence.type).toBe("http_probe");
  });

  it("generates unique ids", () => {
    const a = generateId("EVD");
    const b = generateId("EVD");
    expect(a).not.toBe(b);
    expect(a.startsWith("EVD-")).toBe(true);
  });

  it("validates finding with evidence", () => {
    const finding = FindingSchema.parse({
      id: "FND-001",
      requirementId: "REQ-001",
      severity: "critical",
      status: "verified",
      evidenceIds: ["EVD-001"],
      description: "Undocumented required field beneficiary_id",
    });
    expect(finding.status).toBe("verified");
  });
});
