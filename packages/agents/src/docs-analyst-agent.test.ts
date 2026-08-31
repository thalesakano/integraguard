import { describe, it, expect } from "vitest";
import { extractExpectationsDeterministic } from "./docs-analyst-agent.js";

describe("docs-analyst-agent", () => {
  it("extracts expectation with endpoint, category, source excerpt and predicate", () => {
    const { } = {};
    const expectations = extractExpectationsDeterministic({
      goal: "Create orders",
      documentation: `# Orders API
POST /v1/orders

customerId is required.

Errors are returned as HTTP 4xx/5xx.
`,
    });

    expect(expectations.length).toBeGreaterThan(0);
    const exp = expectations[0]!;
    expect(exp.endpoint.method).toBe("POST");
    expect(exp.endpoint.path).toContain("/v1/orders");
    expect(exp.source.excerpt.length).toBeGreaterThan(0);
    expect(exp.validationPredicate.length).toBeGreaterThan(0);
    expect(exp.category).toBeTruthy();
  });

  it("adds idempotency expectation when docs claim it", () => {
    const expectations = extractExpectationsDeterministic({
      goal: "Submit",
      documentation: "POST /v1/x\nSupports Idempotency-Key for exactly-once.",
    });
    expect(expectations.some((e) => e.category === "idempotency")).toBe(true);
  });
});
