import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diffShapes, normalizeToShape, summarizeDiffs } from "./schema-diff.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("schema-diff", () => {
  it("detects required field added in observed shape", () => {
    const expected = { name: "string" };
    const observed = { name: "string", sku: "string" };
    const diffs = diffShapes(expected, observed);
    expect(diffs.some((d) => d.kind === "required-field-added" && d.path.includes("sku"))).toBe(
      true
    );
  });

  it("detects field removed", () => {
    const diffs = diffShapes({ a: "string", b: "number" }, { a: "string" });
    expect(diffs.some((d) => d.kind === "field-removed" && d.path.includes("b"))).toBe(true);
  });

  it("detects type changed", () => {
    const diffs = diffShapes({ count: "number" }, { count: "string" });
    expect(summarizeDiffs(diffs)).toBe("type-changed");
  });

  it("detects object vs array divergent", () => {
    const diffs = diffShapes({ items: { id: "string" } }, { items: [{ id: "string" }] });
    expect(diffs.some((d) => d.kind === "object-array-divergent")).toBe(true);
  });

  it("returns no diffs when shapes match", () => {
    const shape = normalizeToShape({ id: 1, nested: { ok: true } });
    const diffs = diffShapes(shape, normalizeToShape({ id: 2, nested: { ok: false } }));
    expect(diffs).toEqual([]);
  });

  it("core source has no pre-authorization hardcodes", () => {
    const src = readFileSync(join(__dirname, "schema-diff.ts"), "utf-8");
    for (const token of ["beneficiary_id", "providerTaxId", "procedures", "authorizationId"]) {
      expect(src.includes(token)).toBe(false);
    }
  });
});
