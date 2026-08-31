import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  saveRun,
  sanitizeRunForStorage,
  MAX_TRAJECTORY_EVENTS,
  type StoredRun,
} from "./store";

function baseRun(overrides: Partial<StoredRun> = {}): StoredRun {
  return {
    id: `run-test-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    input: {
      goal: "test",
      documentation: "# api",
      sandboxUrl: "http://localhost:4000/",
      allowedOperations: ["GET"],
    },
    status: "running",
    trajectories: [],
    pendingProbeIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("store limits and redaction", () => {
  const prevDir = process.env.INTEGRAGUARD_RUNS_DIR;
  let tempDir: string | undefined;

  afterEach(() => {
    if (prevDir === undefined) delete process.env.INTEGRAGUARD_RUNS_DIR;
    else process.env.INTEGRAGUARD_RUNS_DIR = prevDir;
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it("redacts secrets in input headers on save (canary)", () => {
    tempDir = mkdtempSync(join(tmpdir(), "ig-store-"));
    process.env.INTEGRAGUARD_RUNS_DIR = tempDir;

    const run = baseRun();
    const input = run.input as StoredRun["input"] & {
      headers?: Record<string, string>;
    };
    input.sampleRequest = { apiKey: "live-secret-value", amount: 10 };
    input.headers = {
      Authorization: "Bearer live-token-xyz",
      "X-API-Key": "key-should-not-persist",
      Accept: "application/json",
    };
    run.input = input;

    saveRun(run);

    const raw = readFileSync(join(tempDir, `${run.id}.json`), "utf-8");
    expect(raw).not.toContain("live-token-xyz");
    expect(raw).not.toContain("key-should-not-persist");
    expect(raw).not.toContain("live-secret-value");
    expect(raw).toContain("[REDACTED]");
    expect(raw).toContain("application/json");
  });

  it("truncates trajectories beyond the limit", () => {
    const trajectories = Array.from({ length: MAX_TRAJECTORY_EVENTS + 50 }, (_, i) => ({
      runId: "r",
      agent: "a",
      instructionVersion: "v2",
      action: `step-${i}`,
      retry: 0,
      timestamp: new Date().toISOString(),
    }));
    const sanitized = sanitizeRunForStorage(baseRun({ trajectories }));
    expect(sanitized.trajectories).toHaveLength(MAX_TRAJECTORY_EVENTS);
    expect(sanitized.trajectories[0]?.action).toBe("step-50");
  });

  it("rejects oversized packs", () => {
    const hugeFinding = {
      id: "FND-1",
      requirementId: "REQ-1",
      severity: "critical" as const,
      status: "verified" as const,
      evidenceIds: [] as string[],
      description: "x".repeat(2.1 * 1024 * 1024),
    };
    expect(() =>
      sanitizeRunForStorage(
        baseRun({
          pack: {
            runId: "r",
            decision: "BLOCKED",
            readinessScore: 0,
            requirements: [],
            findings: [hugeFinding],
            evidences: [],
            unansweredQuestions: [],
            mappings: [],
            generatedAt: new Date().toISOString(),
          },
        })
      )
    ).toThrow(/Pack exceeds storage limit/);
  });
});
