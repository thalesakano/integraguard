import { describe, it, expect } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadProjectConfig,
  configToAnalysisInput,
  resolveExecutionHeaders,
  resolveExecutionHeadersFromConfig,
} from "./project-config-loader.js";

describe("project-config-loader", () => {
  it("loads YAML config safely", () => {
    const path = join(tmpdir(), `integraguard-cfg-${Date.now()}.yaml`);
    writeFileSync(
      path,
      `
version: 1
goal: Validate staging API
sources: {}
target:
  baseUrl: https://staging.example.com
  allowedHosts: [staging.example.com]
  allowedOperations: [GET, POST]
policy:
  maxProbes: 5
credentials:
  apiKeyEnv: STAGING_API_KEY
`
    );
    try {
      const cfg = loadProjectConfig(path);
      expect(cfg.goal).toContain("Validate");
      expect(cfg.policy.maxProbes).toBe(5);
    } finally {
      unlinkSync(path);
    }
  });

  it("propagates allowedHosts, maxProbes, redactionFields and credential env refs without values", () => {
    const path = join(tmpdir(), `integraguard-cfg-prop-${Date.now()}.yaml`);
    writeFileSync(
      path,
      `
version: 1
goal: Propagate config
sources:
  documentation: "# API"
target:
  baseUrl: https://staging.example.com/
  allowedHosts: [staging.example.com]
  allowedOperations: [GET]
policy:
  maxProbes: 7
redaction:
  fields: [email]
credentials:
  apiKeyEnv: STAGING_API_KEY
`
    );
    const prev = process.env.STAGING_API_KEY;
    process.env.STAGING_API_KEY = "super-secret-key";
    try {
      const cfg = loadProjectConfig(path);
      const input = configToAnalysisInput(cfg);
      expect(input.allowedHosts).toEqual(["staging.example.com"]);
      expect(input.maxProbes).toBe(7);
      expect(input.redactionFields).toEqual(["email"]);
      expect(input.credentialEnvRefs).toEqual({ apiKeyEnv: "STAGING_API_KEY" });
      expect(JSON.stringify(input)).not.toContain("super-secret-key");

      const headers = resolveExecutionHeadersFromConfig(cfg);
      expect(headers["X-API-Key"]).toBe("super-secret-key");
      expect(resolveExecutionHeaders(input.credentialEnvRefs)["X-API-Key"]).toBe("super-secret-key");
    } finally {
      unlinkSync(path);
      if (prev === undefined) delete process.env.STAGING_API_KEY;
      else process.env.STAGING_API_KEY = prev;
    }
  });

  it("derives allowedHosts from baseUrl when config list is empty", () => {
    const cfg = {
      version: 1,
      goal: "Derive hosts",
      sources: { documentation: "# API" },
      target: {
        baseUrl: "https://api.vendor.test/",
        allowedHosts: [] as string[],
        allowedOperations: ["GET"],
      },
      policy: { autoApprove: ["GET"], maxProbes: 8, timeoutMs: 10_000, autoApproveProbes: false },
      redaction: { fields: [] as string[] },
      credentials: {},
    };
    const input = configToAnalysisInput(cfg);
    expect(input.allowedHosts).toEqual(["api.vendor.test"]);
  });
});
