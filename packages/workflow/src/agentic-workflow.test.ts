import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { runAgenticContractWorkflow } from "./langgraph-workflow.js";
import type { AnalysisInput } from "@integraguard/schemas";

const INPUT: AnalysisInput = {
  goal: "Create orders",
  documentation: `# Orders
POST /v1/orders
customerId required.
Errors are returned as HTTP 4xx/5xx.
`,
  sampleRequest: { customerId: "c1" },
  sandboxUrl: "http://localhost:4000/scenarios/orders-01/",
  allowedOperations: ["GET", "POST"],
};

async function withServer(
  handler: (
    hits: number,
    reqBody: unknown
  ) => { status: number; body: unknown },
  fn: (baseUrl: string, getBodies: () => unknown[]) => Promise<void>
) {
  let hits = 0;
  const bodies: unknown[] = [];
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
      bodies.push(parsed);
      const out = handler(hits, parsed);
      res.writeHead(out.status, { "content-type": "application/json" });
      res.end(JSON.stringify(out.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  try {
    await fn(`http://127.0.0.1:${addr.port}/`, () => bodies);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

describe("agentic LangGraph workflow", () => {
  it("trajectory visits docs analyst, probe designer, and gate (or human pause)", async () => {
    const result = await runAgenticContractWorkflow(INPUT, {
      autoApproveProbes: false,
      useLlm: false,
    });

    const agents = result.trajectories.map((t) => t.agent);
    expect(agents).toContain("docs-analyst-agent");
    expect(agents).toContain("probe-designer-agent");
    expect(agents.some((a) => a === "risk-router" || a === "human-gate")).toBe(true);

    if (result.paused) {
      expect(result.state.pendingApprovals.length).toBeGreaterThan(0);
    } else {
      expect(agents).toContain("evidence-gate");
      expect(result.pack).toBeDefined();
    }
  });

  it("with auto-approve, can loop designer after result when sandbox responds", async () => {
    const result = await runAgenticContractWorkflow(INPUT, {
      autoApproveProbes: true,
      useLlm: false,
    });
    const agents = result.trajectories.map((t) => t.agent);
    expect(agents).toContain("docs-analyst-agent");
    expect(agents).toContain("probe-designer-agent");
    // sandbox may be down — still must reach execute or gate without throwing
    expect(result.trajectories.length).toBeGreaterThan(3);
  });

  it("proves result-analyst → probe-designer loop when first observation is inconclusive", async () => {
    await withServer(
      (hits) =>
        hits === 1
          ? { status: 503, body: { error: "temporary" } }
          : { status: 200, body: { ok: true } },
      async (baseUrl) => {
        const result = await runAgenticContractWorkflow(
          {
            goal: "Create resource",
            documentation: `# API
POST /v1/resource
id is required.
`,
            sampleRequest: { id: "1" },
            sandboxUrl: baseUrl,
            allowedOperations: ["GET", "POST"],
            targetMode: "custom",
          },
          { autoApproveProbes: true, useLlm: false }
        );

        const agents = result.trajectories.map((t) => t.agent);
        const analystIdx = agents.indexOf("result-analyst-agent");
        expect(analystIdx).toBeGreaterThanOrEqual(0);
        const designerAfter = agents.findIndex(
          (a, i) => i > analystIdx && a === "probe-designer-agent"
        );
        expect(designerAfter).toBeGreaterThan(analystIdx);
        const counter = result.trajectories.find(
          (t) =>
            t.agent === "probe-designer-agent" &&
            typeof t.reason === "string" &&
            t.reason.includes("counterprobe")
        );
        expect(counter).toBeDefined();
      }
    );
  });

  it("adaptive counterprobe after 400 sku required uses a different request body", async () => {
    await withServer(
      (hits) => {
        if (hits === 1) return { status: 400, body: { error: "sku is required" } };
        return { status: 200, body: { ok: true } };
      },
      async (baseUrl, getBodies) => {
        const result = await runAgenticContractWorkflow(
          {
            goal: "Create catalog item",
            documentation: `# API
POST /v1/items
sku is documented as optional.
`,
            sampleRequest: { name: "widget" },
            sandboxUrl: baseUrl,
            allowedOperations: ["GET", "POST"],
            targetMode: "custom",
            maxProbes: 4,
          },
          { autoApproveProbes: true, useLlm: false }
        );

        const bodies = getBodies();
        expect(bodies.length).toBeGreaterThanOrEqual(2);
        expect(bodies[1]).not.toEqual(bodies[0]);
        expect((bodies[1] as Record<string, unknown>).sku).toBe(
          "integraguard-placeholder-sku"
        );

        const counter = result.state.probePlans.find((p) =>
          p.purpose.toLowerCase().includes("counterprobe")
        );
        expect(counter?.expectationId).toBeTruthy();
        expect(counter?.attempt).toBe(2);
      }
    );
  });
});
