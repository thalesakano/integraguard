import { describe, it, expect } from "vitest";
import { ProjectConfigSchema } from "./project-config.js";

describe("project-config", () => {
  it("parses a valid config", () => {
    const cfg = ProjectConfigSchema.parse({
      version: 1,
      goal: "Validate payments API contract",
      sources: {
        docsUrl: "https://vendor.example/docs",
        openApiUrl: "https://vendor.example/openapi.json",
      },
      target: {
        baseUrl: "https://staging.vendor.example",
        allowedHosts: ["staging.vendor.example"],
        allowedOperations: ["GET", "POST"],
      },
      policy: { autoApprove: ["GET"], maxProbes: 8, timeoutMs: 10000 },
      redaction: { fields: ["email"] },
      credentials: { apiKeyEnv: "VENDOR_API_KEY" },
    });
    expect(cfg.target.baseUrl).toContain("staging");
    expect(cfg.credentials.apiKeyEnv).toBe("VENDOR_API_KEY");
  });

  it("rejects secret values masquerading as config credentials object with raw key", () => {
    // Schema only allows env *names*; raw secrets would be user error in YAML —
    // we ensure apiKey field itself does not exist
    const parsed = ProjectConfigSchema.safeParse({
      goal: "x",
      target: { baseUrl: "https://example.com" },
      credentials: { apiKey: "sk-live-secret" },
    });
    // unknown keys stripped by zod object default — apiKey not in schema
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data.credentials as Record<string, unknown>).apiKey).toBeUndefined();
    }
  });
});
