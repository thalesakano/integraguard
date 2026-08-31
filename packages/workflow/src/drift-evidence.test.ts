import { describe, it, expect } from "vitest";
import { evidenceSupportsDrift, promoteContractDrifts } from "./drift-evidence.js";
import type { ContractDrift, Evidence } from "@integraguard/schemas";

const drift = (partial: Partial<ContractDrift>): ContractDrift => ({
  id: "DRIFT-1",
  expectationId: "EXP-1",
  type: "status-semantics-changed",
  status: "candidate",
  evidenceIds: ["EVD-1"],
  summary: "x",
  ...partial,
});

describe("drift-evidence predicates", () => {
  it("rejects status-semantics without 200+business-error", () => {
    const evidences: Evidence[] = [
      {
        id: "EVD-1",
        type: "http_probe",
        sourceReference: "probe:1",
        observation: "HTTP 400",
        payload: { statusCode: 400, body: { error: "bad" } },
      },
    ];
    expect(evidenceSupportsDrift(drift({}), evidences).ok).toBe(false);
  });

  it("accepts status-semantics with 200 + business error", () => {
    const evidences: Evidence[] = [
      {
        id: "EVD-1",
        type: "http_probe",
        sourceReference: "probe:1",
        observation: "HTTP 200",
        payload: { statusCode: 200, body: { businessStatus: "error" } },
      },
    ];
    expect(evidenceSupportsDrift(drift({}), evidences).ok).toBe(true);
  });

  it("requires idempotency pair evidence", () => {
    const evidences: Evidence[] = [
      {
        id: "EVD-1",
        type: "http_probe",
        sourceReference: "probe:1",
        observation: "HTTP 200",
        payload: { statusCode: 200 },
      },
    ];
    expect(
      evidenceSupportsDrift(drift({ type: "idempotency-broken", evidenceIds: ["EVD-1"] }), evidences)
        .ok
    ).toBe(false);
  });

  it("rejects irrelevant evidence for auth drift", () => {
    const evidences: Evidence[] = [
      {
        id: "EVD-1",
        type: "http_probe",
        sourceReference: "probe:1",
        observation: "HTTP 200",
        payload: { statusCode: 200 },
      },
    ];
    expect(
      evidenceSupportsDrift(drift({ type: "auth-changed", evidenceIds: ["EVD-1"] }), evidences).ok
    ).toBe(false);
  });

  it("rejects isolated 401 as auth drift", () => {
    const evidences: Evidence[] = [
      {
        id: "EVD-1",
        type: "http_probe",
        sourceReference: "probe:1",
        observation: "HTTP 401",
        payload: { statusCode: 401 },
      },
    ];
    expect(
      evidenceSupportsDrift(drift({ type: "auth-changed", evidenceIds: ["EVD-1"] }), evidences).ok
    ).toBe(false);
  });

  it("accepts auth drift with failing documented auth + succeeding alternate", () => {
    const evidences: Evidence[] = [
      {
        id: "EVD-1",
        type: "http_probe",
        sourceReference: "probe:documented",
        observation: "HTTP 401",
        payload: { statusCode: 401 },
      },
      {
        id: "EVD-2",
        type: "http_probe",
        sourceReference: "probe:alternate",
        observation: "HTTP 200",
        payload: { statusCode: 200 },
      },
    ];
    expect(
      evidenceSupportsDrift(
        drift({ type: "auth-changed", evidenceIds: ["EVD-1", "EVD-2"] }),
        evidences
      ).ok
    ).toBe(true);
  });

  it("accepts auth drift with controlledAuthComparison payload flag", () => {
    const evidences: Evidence[] = [
      {
        id: "EVD-1",
        type: "http_probe",
        sourceReference: "probe:1",
        observation: "controlled auth comparison",
        payload: { statusCode: 401, controlledAuthComparison: true },
      },
    ];
    expect(
      evidenceSupportsDrift(drift({ type: "auth-changed", evidenceIds: ["EVD-1"] }), evidences).ok
    ).toBe(true);
  });

  it("promoteContractDrifts verifies only supported candidates", () => {
    const evidences: Evidence[] = [
      {
        id: "EVD-1",
        type: "http_probe",
        sourceReference: "probe:1",
        observation: "HTTP 200 business error",
        payload: { statusCode: 200, body: { status: "rejected" } },
      },
    ];
    const { verified, rejected } = promoteContractDrifts(
      [drift({}), drift({ id: "DRIFT-2", type: "auth-changed" })],
      evidences
    );
    expect(verified).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});
