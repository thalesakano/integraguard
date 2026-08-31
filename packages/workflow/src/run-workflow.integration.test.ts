import { describe, it, expect } from "vitest";
import {
  runIntegraGuardWorkflow,
  approveProbeAndContinue,
} from "./run-workflow.js";
import type { AnalysisInput } from "@integraguard/schemas";

const DEMO_INPUT: AnalysisInput = {
  goal: "Submit and query pre-authorization requests for medical procedures",
  documentation: `# Pre-Authorization API v1

## Overview
This API supports pre-authorization with full idempotency via Idempotency-Key header.

## Creating an authorization
POST /v1/pre-authorization

| Field | Type | Required |
|-------|------|----------|
| beneficiaryCard | string | yes |
| procedureCode | string | yes |

### Idempotency
Send Idempotency-Key header to prevent duplicate submissions.

### Response
Returns HTTP 200 with authorizationId and status. Errors are returned as HTTP 4xx/5xx.

## Query status
GET /v1/pre-authorization/{id}
`,
  sampleRequest: {
    beneficiaryCard: "123456",
    procedureCode: "789",
  },
  sandboxUrl: "http://localhost:4000/scenarios/authorization-07/",
  scenarioId: "authorization-07",
  allowedOperations: ["GET", "POST"],
};

async function sandboxHealthy(): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:4000/health", {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

describe("run-workflow integration", () => {
  it("pauses for human approval on mutating probes when autoApprove is false", async () => {
    const result = await runIntegraGuardWorkflow(DEMO_INPUT, {
      autoApproveProbes: false,
    });

    expect(result.paused).toBe(true);
    expect(result.state.status).toBe("awaiting_approval");
    expect(result.state.pendingApprovals.length).toBeGreaterThan(0);
    expect(result.checkpoint.phase).toBe("probes");
    expect(result.pack).toBeUndefined();

    const pending = result.state.pendingApprovals[0]!;
    expect(pending.requiresApproval).toBe(true);
    expect(pending.method).toBe("POST");
  });

  it("resumes after approve and completes pack when sandbox is available", async () => {
    if (!(await sandboxHealthy())) {
      console.warn("Skipping approve→pack: sandbox not healthy on :4000");
      return;
    }

    let result = await runIntegraGuardWorkflow(DEMO_INPUT, {
      autoApproveProbes: false,
    });
    expect(result.paused).toBe(true);

    const maxApprovals = 20;
    let approvals = 0;
    while (result.paused && approvals < maxApprovals) {
      const probeId = result.state.pendingApprovals[0]?.id;
      expect(probeId).toBeTruthy();
      result = await approveProbeAndContinue(result.checkpoint, probeId!, {
        autoApproveProbes: false,
      });
      approvals++;
    }

    expect(result.paused).toBe(false);
    expect(result.pack).toBeDefined();
    expect(result.pack!.decision).toBe("BLOCKED");
    expect(result.pack!.findings.some((f) => f.status === "verified")).toBe(true);
  }, 60_000);
});
