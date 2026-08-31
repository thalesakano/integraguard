/**
 * Agentic evaluation harness — separate from deterministic eval.ts metrics.
 * Writes provenance-stamped results under runs/agentic-fallback/ (or EXPERIMENT).
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { evaluateCase, aggregateMetrics } from "@integraguard/evaluator";
import { runAgenticContractWorkflow } from "@integraguard/workflow";
import { generateId } from "@integraguard/schemas";
import type { TrajectoryEvent } from "@integraguard/schemas";
import { loadAllScenarios, loadScenarioById } from "./load-scenarios.js";

const RUNS_DIR = join(process.cwd(), "runs");
const experiment = process.env.EXPERIMENT ?? "agentic-fallback";
const scenarioFilter = process.argv.find((a) => a.startsWith("--scenario="))?.split("=")[1];
const useLlm = process.argv.includes("--llm") || process.env.INTEGRAGUARD_EVAL_LLM === "1";
const INSTRUCTION_VERSION = "v2";

function gitProvenance(): { sha: string; dirty: boolean } {
  try {
    const sha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    const dirty =
      execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0;
    return { sha, dirty };
  } catch {
    return { sha: "unknown", dirty: true };
  }
}

function fixtureHash(scenarioId: string): string {
  try {
    const dir = join(process.cwd(), "scenarios", scenarioId);
    const docs = readFileSync(join(dir, "api-docs.md"), "utf8");
    const gt = readFileSync(join(dir, "ground-truth.yaml"), "utf8");
    let h = 0;
    const s = docs + gt;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return `h${(h >>> 0).toString(16)}`;
  } catch {
    return "unknown";
  }
}

function countAgenticLoops(trajectories: TrajectoryEvent[]): number {
  return trajectories.filter(
    (t) => t.agent === "probe-designer-agent" && typeof t.reason === "string" && t.reason.includes("counterprobe")
  ).length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

async function main() {
  if (!existsSync(RUNS_DIR)) mkdirSync(RUNS_DIR, { recursive: true });
  const outDir = join(RUNS_DIR, experiment);
  mkdirSync(outDir, { recursive: true });

  const scenarios = scenarioFilter
    ? [loadScenarioById(scenarioFilter)]
    : loadAllScenarios();

  if (scenarios.length === 0) {
    console.error("No scenarios found. Ensure scenarios/ directory exists.");
    process.exit(1);
  }

  const provenance = {
    mode: useLlm ? "agentic-llm" : "agentic-fallback",
    instructionVersion: INSTRUCTION_VERSION,
    timestamp: new Date().toISOString(),
    git: gitProvenance(),
    command: useLlm ? "eval:agentic --llm" : "eval:agentic",
  };

  console.log(
    `Agentic eval (${provenance.mode}) → ${outDir}\n` +
      `  instructionVersion=${INSTRUCTION_VERSION} sha=${provenance.git.sha.slice(0, 8)} dirty=${provenance.git.dirty}`
  );
  console.log(
    "Note: deterministic metrics (eval:baseline / eval:final) are NOT comparable to agentic metrics.\n"
  );

  const results = [];
  const runtimesMs: number[] = [];
  let totalLoops = 0;
  const evalStarted = Date.now();

  for (const scenario of scenarios) {
    console.log(`Evaluating ${scenario.id} (agentic)...`);
    const runId = generateId("eval-agentic");
    const caseStart = Date.now();

    const { pack, trajectories } = await runAgenticContractWorkflow(
      { ...scenario.input, useLlm },
      { autoApproveProbes: true, useLlm }
    );

    if (!pack) {
      console.error(`  No pack for ${scenario.id}`);
      process.exit(1);
    }

    const evalResult = evaluateCase(
      scenario.groundTruth,
      pack.findings,
      pack.evidences,
      pack.decision
    );
    const runtimeMs = Date.now() - caseStart;
    runtimesMs.push(runtimeMs);
    const loops = countAgenticLoops(trajectories);
    totalLoops += loops;

    results.push({
      ...evalResult,
      runtimeMs,
      agenticLoops: loops,
      fixtureHash: fixtureHash(scenario.id),
    });

    writeFileSync(
      join(outDir, `${scenario.id}.json`),
      JSON.stringify(
        {
          provenance,
          runId,
          pack,
          trajectories,
          evalResult,
          runtimeMs,
          fixtureHash: fixtureHash(scenario.id),
        },
        null,
        2
      )
    );

    console.log(
      `  F1: ${evalResult.metrics.weightedF1.toFixed(3)} | Decision: ${pack.decision} | ${runtimeMs}ms`
    );
  }

  const aggregated = aggregateMetrics(results);
  const metricsPath = join(outDir, "metrics.json");
  writeFileSync(
    metricsPath,
    JSON.stringify(
      {
        provenance,
        experiment,
        mode: provenance.mode,
        instructionVersion: INSTRUCTION_VERSION,
        aggregated,
        operational: {
          scenarioCount: scenarios.length,
          totalRuntimeMs: Date.now() - evalStarted,
          medianRuntimeMs: median(runtimesMs),
          totalAgenticLoops: totalLoops,
          llmEnabled: useLlm,
        },
        results: results.map((r) => ({
          caseId: r.caseId,
          metrics: r.metrics,
          runtimeMs: r.runtimeMs,
          agenticLoops: r.agenticLoops,
          fixtureHash: r.fixtureHash,
        })),
      },
      null,
      2
    )
  );

  console.log(`\nAgentic weighted F1: ${aggregated.weightedF1.toFixed(3)}`);
  console.log(`Metrics written to ${metricsPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
