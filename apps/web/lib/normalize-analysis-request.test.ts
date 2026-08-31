import { describe, it, expect } from "vitest";
import { normalizeAnalysisRequest } from "./normalize-analysis-request";

describe("normalizeAnalysisRequest", () => {
  it("defaults autoApproveProbes false for real-api and requires allowedHosts", () => {
    const missing = normalizeAnalysisRequest({
      targetMode: "real-api",
      sandboxUrl: "https://staging.vendor.example/",
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.status).toBe(400);

    const ok = normalizeAnalysisRequest({
      targetMode: "real-api",
      sandboxUrl: "https://staging.vendor.example/",
      allowedHosts: ["staging.vendor.example"],
    });
    expect(ok).toEqual({
      ok: true,
      allowedHosts: ["staging.vendor.example"],
      autoApproveProbes: false,
    });
  });

  it("allows explicit autoApproveProbes true for real-api when hosts provided", () => {
    const ok = normalizeAnalysisRequest({
      targetMode: "real-api",
      sandboxUrl: "https://staging.vendor.example/",
      allowedHosts: ["staging.vendor.example"],
      autoApproveProbes: true,
    });
    expect(ok.ok && ok.autoApproveProbes).toBe(true);
  });

  it("defaults autoApproveProbes true for sandbox and derives hosts", () => {
    const ok = normalizeAnalysisRequest({
      targetMode: "sandbox",
      sandboxUrl: "http://localhost:4000/",
    });
    expect(ok).toEqual({
      ok: true,
      allowedHosts: ["localhost"],
      autoApproveProbes: true,
    });
  });

  it("honors autoApproveProbes false for sandbox", () => {
    const ok = normalizeAnalysisRequest({
      targetMode: "sandbox",
      sandboxUrl: "http://127.0.0.1:4000/",
      autoApproveProbes: false,
    });
    expect(ok.ok && ok.autoApproveProbes).toBe(false);
    expect(ok.ok && ok.allowedHosts).toEqual(["127.0.0.1"]);
  });

  it("defaults autoApproveProbes false for docs-url", () => {
    const ok = normalizeAnalysisRequest({
      targetMode: "docs-url",
      sandboxUrl: "https://api.example.com/",
      allowedHosts: ["api.example.com"],
    });
    expect(ok.ok && ok.autoApproveProbes).toBe(false);
  });
});
