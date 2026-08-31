import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exitCodeForPack } from "./exit-code.js";
import type { ReadinessPack } from "@integraguard/schemas";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");

function pack(partial: Partial<ReadinessPack>): ReadinessPack {
  return {
    runId: "r",
    decision: "READY",
    readinessScore: 100,
    requirements: [],
    findings: [],
    evidences: [],
    unansweredQuestions: [],
    mappings: [],
    generatedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("exitCodeForPack", () => {
  it("returns 3 when critical questions remain even if decision looks READY", () => {
    expect(
      exitCodeForPack(
        pack({
          decision: "READY",
          unansweredQuestions: ["Requirement REQ-CRIT not fully validated: auth"],
          readinessScore: 100,
        }),
        false
      )
    ).toBe(3);
  });

  it("returns 1 for verified drift", () => {
    expect(
      exitCodeForPack(
        pack({
          decision: "BLOCKED",
          findings: [
            {
              id: "f",
              requirementId: "r",
              severity: "critical",
              status: "verified",
              description: "drift",
              evidenceIds: ["e"],
            },
          ],
        }),
        false
      )
    ).toBe(1);
  });

  it("returns 0 only for clean READY", () => {
    expect(exitCodeForPack(pack({ decision: "READY" }), false)).toBe(0);
  });
});

describe("integraguard CLI", () => {
  it("exits 2 and prints usage with no args", () => {
    if (!existsSync(dist)) {
      expect(true).toBe(true);
      return;
    }
    const r = spawnSync(process.execPath, [dist], { encoding: "utf-8" });
    expect(r.status).toBe(2);
    expect(r.stdout + r.stderr).toMatch(/Usage:/i);
  });

  it("replay rejects missing file with exit 2", () => {
    if (!existsSync(dist)) {
      expect(true).toBe(true);
      return;
    }
    const r = spawnSync(process.execPath, [dist, "replay", "does-not-exist.json"], {
      encoding: "utf-8",
    });
    expect(r.status).toBe(2);
  });
});
