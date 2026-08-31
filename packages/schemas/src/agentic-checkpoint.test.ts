import { describe, it, expect } from "vitest";
import {
  AgenticCheckpointSchema,
  parseAgenticCheckpoint,
  safeParseAgenticCheckpoint,
} from "./index.js";

const minimal = {
  runId: "run-1",
  input: {
    goal: "Create orders",
    documentation: "POST /v1/orders",
    sandboxUrl: "http://127.0.0.1:4000/",
    allowedOperations: ["GET", "POST"],
  },
  useLlm: false,
  autoApprove: false,
  maxProbes: 8,
  probesUsed: 1,
  loopCount: 0,
  maxLoops: 2,
  expectations: [
    {
      id: "EXP-1",
      endpoint: { method: "POST", path: "/v1/orders" },
      category: "request-schema",
      statement: "customerId required",
      source: { section: "Create", excerpt: "customerId" },
      confidence: 0.8,
      validationPredicate: "fields match",
    },
  ],
  probePlans: [],
  probeQueue: [],
  pendingApprovals: [],
  approvedProbeIds: [],
  probeResults: [],
  observations: [
    {
      probeId: "probe-1",
      expectationId: "EXP-1",
      statusCode: 400,
      body: { error: "schema invalid" },
      durationMs: 12,
    },
  ],
  driftCandidates: [
    {
      id: "DRIFT-1",
      expectationId: "EXP-1",
      type: "response-shape-changed",
      status: "candidate",
      evidenceIds: ["EVD-1"],
      summary: "Request schema mismatch",
    },
  ],
  evidences: [],
  requirements: [],
  mappings: [],
  candidateFindings: [],
  verifiedFindings: [],
  trajectories: [],
  needsMoreProbes: false,
  status: "awaiting_approval",
  route: "approve",
  instructionVersion: "v2",
};

describe("AgenticCheckpointSchema", () => {
  it("parses a full checkpoint roundtrip", () => {
    const parsed = parseAgenticCheckpoint(minimal);
    expect(parsed.observations).toHaveLength(1);
    expect(parsed.driftCandidates[0]?.summary).toContain("schema");
    const again = AgenticCheckpointSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(again.probesUsed).toBe(1);
    expect(again.runId).toBe("run-1");
  });

  it("strips unknown secret fields on parse", () => {
    const bad = {
      ...minimal,
      executionHeaders: { Authorization: "Bearer secret" },
    };
    const result = safeParseAgenticCheckpoint(bad);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).executionHeaders).toBeUndefined();
    }
  });

  it("fails when required agentic fields are missing", () => {
    const result = safeParseAgenticCheckpoint({ runId: "x" });
    expect(result.success).toBe(false);
  });
});
