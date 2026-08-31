import { describe, it, expect } from "vitest";
import {
  designProbesDeterministic,
  extractRequiredFieldHint,
} from "./probe-designer-agent.js";
import type { DocumentedExpectation } from "@integraguard/schemas";

const expectation = (partial: Partial<DocumentedExpectation>): DocumentedExpectation => ({
  id: "EXP-1",
  endpoint: { method: "POST", path: "/v1/orders" },
  category: "request-schema",
  statement: "customerId required",
  source: { section: "Create", excerpt: "customerId" },
  confidence: 0.9,
  validationPredicate: "has customerId",
  ...partial,
});

describe("probe-designer-agent", () => {
  it("derives path/method from expectation catalog", () => {
    const plans = designProbesDeterministic({
      expectations: [expectation({})],
      sandboxUrl: "http://localhost:4000/scenarios/orders-01/",
      remainingBudget: 5,
      sampleRequest: { customerId: "c1" },
    });
    expect(plans[0]?.method).toBe("POST");
    expect(plans[0]?.endpoint).toBe("/v1/orders");
    expect(plans[0]?.expectationId).toBe("EXP-1");
    expect(plans[0]?.expectedEvidence).toBeTruthy();
  });

  it("does not invent endpoints outside catalog", () => {
    const plans = designProbesDeterministic({
      expectations: [expectation({ endpoint: { method: "POST", path: "/v1/orders" } })],
      sandboxUrl: "http://localhost:4000/",
      remainingBudget: 5,
    });
    expect(plans.every((p) => p.endpoint === "/v1/orders")).toBe(true);
  });

  it("respects budget", () => {
    const plans = designProbesDeterministic({
      expectations: [
        expectation({ id: "a" }),
        expectation({ id: "b", category: "status-semantics" }),
        expectation({ id: "c", category: "authentication" }),
      ],
      sandboxUrl: "http://localhost:4000/",
      remainingBudget: 1,
    });
    expect(plans.length).toBeLessThanOrEqual(1);
  });

  it("creates counterprobe after previous 400 with required field — body differs", () => {
    const firstBody = { customerId: "c1" };
    const plans = designProbesDeterministic({
      expectations: [expectation({})],
      sandboxUrl: "http://localhost:4000/",
      remainingBudget: 5,
      sampleRequest: firstBody,
      previousObservation: {
        statusCode: 400,
        body: { error: "sku is required" },
        expectationId: "EXP-1",
        probeId: "probe-first",
      },
    });
    const counter = plans.find((p) => p.purpose.toLowerCase().includes("counterprobe"));
    expect(counter).toBeDefined();
    expect(counter?.expectationId).toBe("EXP-1");
    expect(counter?.attempt).toBe(2);
    expect(counter?.retryOfProbeId).toBe("probe-first");
    expect(counter?.body).not.toEqual(firstBody);
    expect((counter?.body as Record<string, unknown>).sku).toBe("integraguard-placeholder-sku");
  });

  it("extractRequiredFieldHint parses common messages", () => {
    expect(extractRequiredFieldHint({ error: "sku is required" })).toBe("sku");
    expect(extractRequiredFieldHint("missing field customerId")).toBe("customerId");
  });
});
