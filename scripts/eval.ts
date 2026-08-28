import { mkdirSync, writeFileSync, existsSync } from "node:fs";

import { join } from "node:path";

import { runBaselineV0, evaluateCase, aggregateMetrics } from "@integraguard/evaluator";

import { runIntegraGuardWorkflow } from "@integraguard/workflow";

import { generateId } from "@integraguard/schemas";

import type { TrajectoryEvent } from "@integraguard/schemas";

import { loadAllScenarios, loadScenarioById } from "./load-scenarios.js";



const RUNS_DIR = join(process.cwd(), "runs");

const mode = process.argv[2] ?? "baseline";

const experiment = process.env.EXPERIMENT ?? (mode === "baseline" ? "v0-baseline" : "v4-evidence-gate");

const scenarioFilter = process.argv.find((a) => a.startsWith("--scenario="))?.split("=")[1];



function countVerifierRetries(trajectories: TrajectoryEvent[]): number {

  return trajectories.filter(

    (t) => t.agent === "adversarial-verifier" && (t.retry ?? 0) > 0

  ).length;

}



function median(values: number[]): number {

  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);

  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0

    ? (sorted[mid - 1]! + sorted[mid]!) / 2

    : sorted[mid]!;

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



  const results = [];

  const runtimesMs: number[] = [];

  let totalVerifierRetries = 0;

  const evalStarted = Date.now();



  for (const scenario of scenarios) {

    console.log(`Evaluating ${scenario.id} (${mode})...`);

    const runId = generateId("eval");

    const caseStart = Date.now();



    if (mode === "baseline") {

      const { pack, trajectories } = await runBaselineV0(runId, scenario.input);

      const evalResult = evaluateCase(scenario.groundTruth, pack.findings, pack.evidences, pack.decision);

      const runtimeMs = Date.now() - caseStart;

      runtimesMs.push(runtimeMs);

      totalVerifierRetries += countVerifierRetries(trajectories);

      results.push({ ...evalResult, runtimeMs, verifierRetries: countVerifierRetries(trajectories) });

      writeFileSync(

        join(outDir, `${scenario.id}.json`),

        JSON.stringify({ pack, trajectories, evalResult, runtimeMs }, null, 2)

      );

      console.log(

        `  F1: ${evalResult.metrics.weightedF1.toFixed(3)} | Decision match: ${evalResult.metrics.decisionMatch} | ${runtimeMs}ms`

      );

    } else {

      const { pack, trajectories } = await runIntegraGuardWorkflow(scenario.input, {

        autoApproveProbes: true,

      });

      const evalResult = evaluateCase(scenario.groundTruth, pack.findings, pack.evidences, pack.decision);

      const runtimeMs = Date.now() - caseStart;

      runtimesMs.push(runtimeMs);

      const retries = countVerifierRetries(trajectories);

      totalVerifierRetries += retries;

      results.push({ ...evalResult, runtimeMs, verifierRetries: retries });

      writeFileSync(

        join(outDir, `${scenario.id}.json`),

        JSON.stringify({ pack, trajectories, evalResult, runtimeMs }, null, 2)

      );

      console.log(

        `  F1: ${evalResult.metrics.weightedF1.toFixed(3)} | Decision: ${pack.decision} | Blockers: ${evalResult.detectedBlockers.length} | ${runtimeMs}ms`

      );

    }

  }



  const aggregated = aggregateMetrics(results);

  const totalRuntimeMs = Date.now() - evalStarted;

  const operational = {

    scenarioCount: scenarios.length,

    totalRuntimeMs,

    medianRuntimeMs: median(runtimesMs),

    avgRuntimeMsPerCase: runtimesMs.reduce((s, v) => s + v, 0) / (runtimesMs.length || 1),

    totalVerifierRetries,

    costPerCaseUsd: 0,

    llmEnabled: Boolean(process.env.OPENAI_API_KEY),

  };



  const metricsPath = join(outDir, "metrics.json");

  writeFileSync(

    metricsPath,

    JSON.stringify(

      {

        experiment,

        mode,

        aggregated,

        operational,

        results: results.map((r) => ({

          caseId: r.caseId,

          metrics: r.metrics,

          runtimeMs: r.runtimeMs,

          verifierRetries: r.verifierRetries,

        })),

      },

      null,

      2

    )

  );



  console.log(`\nAggregated weighted F1: ${aggregated.weightedF1.toFixed(3)}`);

  console.log(`Median runtime: ${operational.medianRuntimeMs.toFixed(0)}ms/case`);

  console.log(`Total verifier retries: ${operational.totalVerifierRetries}`);

  console.log(`Cost per case: $${operational.costPerCaseUsd.toFixed(4)} (deterministic mode)`);

  console.log(`Metrics written to ${metricsPath}`);

}



main().catch((err) => {

  console.error(err);

  process.exit(1);

});


