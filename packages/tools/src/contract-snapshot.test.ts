import { describe, it, expect } from "vitest";
import { buildContractSnapshot, diffContractSnapshots } from "./contract-snapshot.js";

describe("contract-snapshot", () => {
  it("fingerprints shapes without storing secrets", () => {
    const snap = buildContractSnapshot({
      targetBaseUrl: "https://staging.example",
      endpoints: [
        {
          method: "POST",
          path: "/v1/pay",
          requestShape: { amount: 10, token: "secret" },
          responseShape: { id: "x" },
          statusCodes: [200],
        },
      ],
    });
    expect(snap.fingerprint).toHaveLength(16);
    expect(JSON.stringify(snap)).not.toContain("secret");
  });

  it("detects shape drift between snapshots", () => {
    const a = buildContractSnapshot({
      targetBaseUrl: "https://x",
      endpoints: [{ method: "GET", path: "/v1/items", responseShape: { page: 1 } }],
    });
    const b = buildContractSnapshot({
      targetBaseUrl: "https://x",
      endpoints: [{ method: "GET", path: "/v1/items", responseShape: { nextCursor: "abc" } }],
    });
    const diff = diffContractSnapshots(a, b);
    expect(diff.changed).toBe(true);
    expect(diff.details.some((d) => d.includes("response shape"))).toBe(true);
  });

  it("detects status code drift between snapshots", () => {
    const a = buildContractSnapshot({
      targetBaseUrl: "https://x",
      endpoints: [{ method: "POST", path: "/v1/x", statusCodes: [200] }],
    });
    const b = buildContractSnapshot({
      targetBaseUrl: "https://x",
      endpoints: [{ method: "POST", path: "/v1/x", statusCodes: [201] }],
    });
    const diff = diffContractSnapshots(a, b);
    expect(diff.changed).toBe(true);
    expect(
      diff.details.some((d) => d.includes("status codes") && d.includes("200") && d.includes("201"))
    ).toBe(true);
  });
});
