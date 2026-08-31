import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import {
  runAgenticContractWorkflow,
  approveAgenticProbeAndContinue,
} from "./langgraph-workflow.js";
import { parseAgenticCheckpoint } from "./agentic-state.js";
import type { AnalysisInput } from "@integraguard/schemas";
import type { SerializableWorkflowState } from "./run-workflow.js";

async function withServer(
  handler: (hits: number, reqBody: unknown) => { status: number; body: unknown },
  fn: (baseUrl: string) => Promise<void>
) {
  let hits = 0;
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      hits += 1;
      let parsed: unknown = undefined;
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }
      }
      const out = handler(hits, parsed);
      res.writeHead(out.status, { "content-type": "application/json" });
      res.end(JSON.stringify(out.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  try {
    await fn(`http://127.0.0.1:${addr.port}/`);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

/** Simulate process restart — JSON stringify/parse the serializable checkpoint. */
function roundtripCheckpoint(cp: SerializableWorkflowState): SerializableWorkflowState {
  const raw = JSON.parse(JSON.stringify(cp)) as unknown;
  if (cp.agentic) {
    parseAgenticCheckpoint((raw as SerializableWorkflowState).agentic);
  }
  return raw as SerializableWorkflowState;
}

describe("agentic pause/resume checkpoint", () => {
  it("preserves schema drift across JSON roundtrip approvals", async () => {
    await withServer(
      (hits) => {
        if (hits === 1) {
          return { status: 400, body: { error: "request schema invalid" } };
        }
        return { status: 200, body: { ok: true, id: "ord_1" } };
      },
      async (baseUrl) => {
        const input: AnalysisInput = {
          goal: "Create orders",
          documentation: `# Orders
POST /v1/orders
customerId required.
Errors are returned as HTTP 4xx/5xx.
`,
          sampleRequest: { customerId: "c1" },
          sandboxUrl: baseUrl,
          allowedOperations: ["GET", "POST"],
          targetMode: "custom",
          maxProbes: 6,
        };

        let result = await runAgenticContractWorkflow(input, {
          autoApproveProbes: false,
          useLlm: false,
        });

        expect(result.paused).toBe(true);
        expect(result.checkpoint.agentic).toBeDefined();
        expect(result.checkpoint.agentic!.expectations.length).toBeGreaterThan(0);

        let rounds = 0;
        const seenDriftAfterProbe: string[] = [];

        while (result.paused && rounds < 8) {
          rounds += 1;
          const pending = result.checkpoint.pendingApprovals[0] ?? result.state.pendingApprovals[0];
          expect(pending).toBeDefined();

          const cp = roundtripCheckpoint(result.checkpoint);
          expect(cp.agentic?.expectations.length).toBe(
            result.checkpoint.agentic!.expectations.length
          );
          if (result.checkpoint.agentic!.observations.length > 0) {
            expect(cp.agentic!.observations).toEqual(result.checkpoint.agentic!.observations);
          }
          if (result.checkpoint.agentic!.driftCandidates.length > 0) {
            expect(cp.agentic!.driftCandidates.map((d) => d.id)).toEqual(
              result.checkpoint.agentic!.driftCandidates.map((d) => d.id)
            );
            seenDriftAfterProbe.push(
              ...result.checkpoint.agentic!.driftCandidates.map((d) => d.summary)
            );
          }

          result = await approveAgenticProbeAndContinue(cp, pending!.id, {
            autoApproveProbes: false,
            useLlm: false,
          });
        }

        expect(result.paused).toBe(false);
        expect(result.pack).toBeDefined();
        expect(result.pack!.decision).not.toBe("READY");

        const schemaFinding = result.pack!.findings.some(
          (f) =>
            f.description.toLowerCase().includes("schema") ||
            (f.blockerType ?? "").toLowerCase().includes("schema") ||
            f.description.toLowerCase().includes("mismatch")
        );
        expect(schemaFinding).toBe(true);

        expect(result.trajectories).toEqual(
          expect.arrayContaining([expect.objectContaining({ action: "mismatch" })])
        );

        // Observations / drifts survived the resume path
        expect(result.checkpoint.agentic!.observations.length).toBeGreaterThan(0);
        expect(
          result.checkpoint.agentic!.driftCandidates.length +
            result.pack!.findings.filter((f) => f.status === "verified").length
        ).toBeGreaterThan(0);
        void seenDriftAfterProbe;
      }
    );
  });
});
