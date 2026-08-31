import { describe, it, expect } from "vitest";
import {
  DocumentedExpectationSchema,
  ContractObservationSchema,
  ContractDriftSchema,
} from "./contract-drift.js";

describe("contract-drift schemas", () => {
  it("accepts a valid documented expectation", () => {
    const exp = DocumentedExpectationSchema.parse({
      id: "EXP-001",
      endpoint: { method: "POST", path: "/v1/orders" },
      category: "request-schema",
      statement: "Field customerId is required",
      source: { section: "Create Order", excerpt: "customerId | string | required" },
      confidence: 0.9,
      validationPredicate: "request.body.required.includes('customerId')",
    });
    expect(exp.endpoint.method).toBe("POST");
  });

  it("rejects drift without expectationId", () => {
    expect(() =>
      ContractDriftSchema.parse({
        id: "DRIFT-001",
        expectationId: "",
        type: "required-field-added",
        status: "candidate",
        evidenceIds: ["EVD-1"],
        summary: "missing field",
      })
    ).toThrow();
  });

  it("rejects invalid drift status", () => {
    expect(() =>
      ContractDriftSchema.parse({
        id: "DRIFT-001",
        expectationId: "EXP-001",
        type: "required-field-added",
        status: "verified-by-llm",
        evidenceIds: [],
        summary: "x",
      })
    ).toThrow();
  });

  it("requires redacted request/response on observation", () => {
    expect(() =>
      ContractObservationSchema.parse({
        probeId: "p1",
        expectationId: "EXP-001",
        request: { method: "GET" },
        response: { statusCode: 200 },
        normalized: { durationMs: 10 },
      })
    ).toThrow();
  });

  it("accepts observation with redacted shapes", () => {
    const obs = ContractObservationSchema.parse({
      probeId: "p1",
      expectationId: "EXP-001",
      request: {
        method: "POST",
        url: "https://staging.example/v1/orders",
        headers: { Authorization: "[REDACTED]" },
        body: { customerId: "c1" },
      },
      response: { statusCode: 400, body: { error: "sku required" } },
      normalized: {
        statusCode: 400,
        bodyShape: { error: "string" },
        durationMs: 12,
      },
    });
    expect(obs.request.headers?.Authorization).toBe("[REDACTED]");
  });
});
