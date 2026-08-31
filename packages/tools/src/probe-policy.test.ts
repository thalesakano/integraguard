import { describe, it, expect } from "vitest";
import { evaluateProbePolicy } from "./probe-policy.js";

describe("probe-policy", () => {
  const base = {
    url: "https://staging.vendor.example/v1/items",
    allowedHosts: ["staging.vendor.example"],
    allowedOperations: ["GET", "POST"],
    remainingBudget: 5,
  };

  it("auto-executes GET on allowed host", () => {
    const d = evaluateProbePolicy({ ...base, method: "GET" });
    expect(d.action).toBe("auto-execute");
  });

  it("requires approval for POST in real-api mode", () => {
    const d = evaluateProbePolicy({
      ...base,
      method: "POST",
      targetMode: "real-api",
    });
    expect(d.action).toBe("require-approval");
  });

  it("blocks host outside allowlist", () => {
    const d = evaluateProbePolicy({
      ...base,
      method: "GET",
      url: "https://evil.example/v1",
    });
    expect(d.action).toBe("block");
  });

  it("blocks method outside allowedOperations", () => {
    const d = evaluateProbePolicy({ ...base, method: "DELETE" });
    expect(d.action).toBe("block");
  });

  it("blocks empty allowlist fail-closed", () => {
    const d = evaluateProbePolicy({
      ...base,
      method: "GET",
      allowedHosts: [],
    });
    expect(d.action).toBe("block");
  });

  it("requires approval for POST without real-api too", () => {
    const d = evaluateProbePolicy({ ...base, method: "POST" });
    expect(d.action).toBe("require-approval");
  });
});
