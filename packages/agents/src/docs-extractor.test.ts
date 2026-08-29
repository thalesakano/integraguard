import { describe, it, expect } from "vitest";
import { extractApiDocsFromCrawl, buildOpenApiFromExtraction } from "./docs-extractor.js";
import { parseOpenApi } from "@integraguard/tools";

describe("extractApiDocsFromCrawl heuristics", () => {
  it("parses markdown-style METHOD /path and absolute API URLs", async () => {
    const { extraction, usedLlm } = await extractApiDocsFromCrawl({
      seedUrl: "https://docs.example.com/api",
      combinedText: `
# Payments API
Base URL: https://api.example.com

- [POST /v1/charges](https://docs.example.com/api/charges/create.md)
- [GET /v1/charges/:id](https://docs.example.com/api/charges/retrieve.md)

curl POST https://api.example.com/v1/customers \\
`,
      sourceUrls: ["https://docs.example.com/api.md"],
      suggestedBaseUrl: "https://api.example.com",
    });
    expect(usedLlm).toBe(false);
    const keys = extraction.endpoints.map((e) => `${e.method} ${e.path}`);
    expect(keys).toContain("POST /v1/charges");
    expect(keys).toContain("GET /v1/charges/{id}");
    expect(keys).toContain("POST /v1/customers");
    expect(extraction.baseUrl).toContain("api.example.com");
  });
});

describe("buildOpenApiFromExtraction", () => {
  it("emits paths the contract mapper can consume", () => {
    const spec = buildOpenApiFromExtraction({
      title: "Stripe API",
      baseUrl: "https://api.stripe.com",
      endpoints: [
        {
          method: "POST",
          path: "/v1/checkout/sessions",
          requiredFields: ["line_items", "mode"],
          optionalFields: ["success_url"],
          errorCodes: [],
          claims: [],
        },
      ],
      inconsistencies: [],
      documentationMarkdown: "",
      sourceUrls: [],
    });
    const parsed = parseOpenApi(spec);
    expect(parsed.title).toBe("Stripe API");
    expect(parsed.endpoints[0]?.method).toBe("POST");
    expect(parsed.endpoints[0]?.path).toBe("/v1/checkout/sessions");
  });
});
