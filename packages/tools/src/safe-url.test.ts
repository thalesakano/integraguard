import { describe, expect, it } from "vitest";
import { validateTargetUrl, resolveAndValidateHost } from "./safe-url.js";

const base = {
  allowedHosts: ["api.example.com"],
  allowPrivateNetwork: false,
};

describe("validateTargetUrl", () => {
  it("blocks empty allowlist (fail-closed)", () => {
    const r = validateTargetUrl("https://api.example.com/", { allowedHosts: [] });
    expect(r.ok).toBe(false);
  });

  it("blocks non-http protocols", () => {
    const r = validateTargetUrl("file:///etc/passwd", base);
    expect(r.ok).toBe(false);
  });

  it("blocks metadata IP", () => {
    const r = validateTargetUrl("http://169.254.169.254/latest", {
      allowedHosts: ["169.254.169.254"],
      allowPrivateNetwork: false,
    });
    expect(r.ok).toBe(false);
  });

  it("blocks private IPv4", () => {
    expect(validateTargetUrl("http://127.0.0.1/", { allowedHosts: ["127.0.0.1"] }).ok).toBe(false);
    expect(validateTargetUrl("http://10.0.0.5/", { allowedHosts: ["10.0.0.5"] }).ok).toBe(false);
    expect(validateTargetUrl("http://192.168.1.1/", { allowedHosts: ["192.168.1.1"] }).ok).toBe(
      false
    );
  });

  it("allows public host on allowlist", () => {
    const r = validateTargetUrl("https://api.example.com/v1", base);
    expect(r.ok).toBe(true);
  });

  it("blocks disallowed ports", () => {
    const r = validateTargetUrl("https://api.example.com:22/", base);
    expect(r.ok).toBe(false);
  });

  it("allows private when local-dev exception set", () => {
    const r = validateTargetUrl("http://127.0.0.1:4000/health", {
      allowedHosts: ["127.0.0.1", "localhost"],
      allowPrivateNetwork: true,
      allowedPorts: [4000, 80, 443],
    });
    expect(r.ok).toBe(true);
  });
});

describe("resolveAndValidateHost", () => {
  it("blocks literal loopback IPv6", async () => {
    const r = await resolveAndValidateHost("::1", { allowedHosts: ["::1"] });
    expect(r.ok).toBe(false);
  });
});
