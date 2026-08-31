/**
 * LLM / pipeline matrix — records deterministic, agentic-fallback, and replay modes.
 * Live LLM (`agentic-llm`) is attempted only when OPENAI_API_KEY is set.
 *
 * Usage:
 *   pnpm eval:matrix
 *   pnpm eval:matrix --write
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:http";
import {
  runIntegraGuardWorkflow,
  runAgenticContractWorkflow,
} from "@integraguard/workflow";
import type { AnalysisInput, TrajectoryEvent } from "@integraguard/schemas";
import { isLlmAvailable } from "@integraguard/agents";

const OUT_DIR = join(process.cwd(), "runs", "llm-matrix");
const DOCS_OUT = join(process.cwd(), "docs", "llm-matrix-results.md");
const writeDocs = process.argv.includes("--write");

interface MatrixRow {
  mode: "deterministic" | "agentic-fallback" | "agentic-llm" | "replay";
  model: string;
  instructionVersion: string;
  latencyMs: number;
  decision?: string;
  verifiedDrifts: number;
  trajectoryAgents: string[];
  label: string;
  notes: string;
}

function fixtureInput(baseUrl: string): AnalysisInput {
  return {
    goal: "Validate resource create contract",
    documentation: `# API
POST /v1/resource
id is required.
Errors use HTTP 4xx.
`,
    sampleRequest: { id: "x" },
    sandboxUrl: baseUrl,
    allowedOperations: ["GET", "POST"],
    targetMode: "custom",
  };
}

async function withLocalApi<T>(
  handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void,
  fn: (baseUrl: string) => Promise<T>
): Promise<T> {
  const server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  const baseUrl = `http://127.0.0.1:${addr.port}/`;
  try {
    return await fn(baseUrl);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

function instructionFrom(traj: TrajectoryEvent[]): string {
  const withIv = traj.find((t) => t.instructionVersion);
  return withIv?.instructionVersion ?? "unknown";
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const rows: MatrixRow[] = [];

  const localHandler = (
    _req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse
  ) => {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "sku is required" }));
  };

  // deterministic
  {
    const t0 = Date.now();
    const result = await withLocalApi(localHandler, (base) =>
      runIntegraGuardWorkflow(fixtureInput(base), { autoApproveProbes: true, useLlm: false })
    );
    rows.push({
      mode: "deterministic",
      model: "none",
      instructionVersion: instructionFrom(result.trajectories),
      latencyMs: Date.now() - t0,
      decision: result.pack?.decision,
      verifiedDrifts: result.pack?.findings.filter((f) => f.status === "verified").length ?? 0,
      trajectoryAgents: [...new Set(result.trajectories.map((t) => t.agent))],
      label: "deterministic",
      notes: "Fixed heuristics + Evidence Gate",
    });
    writeFileSync(join(OUT_DIR, "deterministic.json"), JSON.stringify(result, null, 2));
  }

  // agentic fallback (no LLM)
  {
    const t0 = Date.now();
    const result = await withLocalApi(localHandler, (base) =>
      runAgenticContractWorkflow(fixtureInput(base), { autoApproveProbes: true, useLlm: false })
    );
    rows.push({
      mode: "agentic-fallback",
      model: "none",
      instructionVersion: instructionFrom(result.trajectories),
      latencyMs: Date.now() - t0,
      decision: result.pack?.decision,
      verifiedDrifts: result.pack?.findings.filter((f) => f.status === "verified").length ?? 0,
      trajectoryAgents: [...new Set(result.trajectories.map((t) => t.agent))],
      label: "agentic-fallback",
      notes: "LangGraph nodes + deterministic agent bodies",
    });
    writeFileSync(join(OUT_DIR, "agentic-fallback.json"), JSON.stringify(result, null, 2));
  }

  // agentic LLM live (optional)
  if (isLlmAvailable()) {
    const t0 = Date.now();
    const result = await withLocalApi(localHandler, (base) =>
      runAgenticContractWorkflow(fixtureInput(base), { autoApproveProbes: true, useLlm: true })
    );
    rows.push({
      mode: "agentic-llm",
      model: process.env.OPENAI_MODEL || "openai",
      instructionVersion: instructionFrom(result.trajectories),
      latencyMs: Date.now() - t0,
      decision: result.pack?.decision,
      verifiedDrifts: result.pack?.findings.filter((f) => f.status === "verified").length ?? 0,
      trajectoryAgents: [...new Set(result.trajectories.map((t) => t.agent))],
      label: "agentic-llm",
      notes: "Live LLM enrich — Evidence Gate still decides",
    });
    writeFileSync(join(OUT_DIR, "agentic-llm.json"), JSON.stringify(result, null, 2));
  } else {
    rows.push({
      mode: "agentic-llm",
      model: "skipped",
      instructionVersion: "n/a",
      latencyMs: 0,
      verifiedDrifts: 0,
      trajectoryAgents: [],
      label: "agentic-llm",
      notes: "Skipped — OPENAI_API_KEY not set",
    });
  }

  // replay from deterministic artifact
  {
    const path = join(OUT_DIR, "deterministic.json");
    const data = JSON.parse(readFileSync(path, "utf-8")) as {
      pack?: { decision?: string; findings?: { status: string }[] };
      trajectories?: TrajectoryEvent[];
    };
    rows.push({
      mode: "replay",
      model: "none",
      instructionVersion: instructionFrom(data.trajectories ?? []),
      latencyMs: 0,
      decision: data.pack?.decision,
      verifiedDrifts: data.pack?.findings?.filter((f) => f.status === "verified").length ?? 0,
      trajectoryAgents: [...new Set((data.trajectories ?? []).map((t) => t.agent))],
      label: "replay",
      notes: "Offline replay — not a live model call",
    });
  }

  writeFileSync(join(OUT_DIR, "matrix.json"), JSON.stringify(rows, null, 2));

  const md = [
    "# LLM matrix results",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| Mode | Model | Instruction | Latency (ms) | Decision | Verified drifts | Label |",
    "|------|-------|-------------|--------------|----------|-----------------|-------|",
    ...rows.map(
      (r) =>
        `| ${r.mode} | ${r.model} | ${r.instructionVersion} | ${r.latencyMs} | ${r.decision ?? "—"} | ${r.verifiedDrifts} | \`${r.label}\` |`
    ),
    "",
    "## Notes",
    "",
    ...rows.map((r) => `- **${r.mode}**: ${r.notes}`),
    "",
    "Replay is labeled offline and must never be presented as a live LLM call.",
    "",
  ].join("\n");

  console.log(md);
  if (writeDocs) {
    writeFileSync(DOCS_OUT, md);
    console.error(`Wrote ${DOCS_OUT}`);
  }
  if (!existsSync(join(OUT_DIR, "matrix.json"))) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
