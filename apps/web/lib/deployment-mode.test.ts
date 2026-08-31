import { describe, it, expect, afterEach } from "vitest";
import { isDemoMode, demoModeTargetViolation, demoModeDocsUrlViolation } from "./deployment-mode";

describe("deployment-mode", () => {
  const keys = ["DEMO_MODE", "INTEGRAGUARD_DEMO_MODE", "INTEGRAGUARD_DEMO_ONLY"] as const;
  const prev: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  function enableDemo() {
    for (const k of keys) prev[k] = process.env[k];
    process.env.INTEGRAGUARD_DEMO_MODE = "1";
  }

  it("is off by default", () => {
    for (const k of keys) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
    expect(isDemoMode()).toBe(false);
    expect(demoModeTargetViolation("https://evil.example/")).toBeNull();
  });

  it("blocks external targets and docs URLs when enabled", () => {
    enableDemo();
    expect(isDemoMode()).toBe(true);
    expect(demoModeTargetViolation("http://localhost:4000/")).toBeNull();
    expect(demoModeTargetViolation("https://api.example.com/")).toMatch(/Demo mode/);
    expect(demoModeDocsUrlViolation("https://docs.example.com/api")).toMatch(/Demo mode/);
    expect(demoModeDocsUrlViolation("http://127.0.0.1:3000/docs")).toBeNull();
  });
});
