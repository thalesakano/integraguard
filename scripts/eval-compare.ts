import { readFileSync, existsSync } from "node:fs";

import { join } from "node:path";



const expA = process.argv[2] ?? "v0-baseline";

const expB = process.argv[3] ?? "v4-evidence-gate";

const runsDir = join(process.cwd(), "runs");



function loadMetrics(experiment: string) {

  const path = join(runsDir, experiment, "metrics.json");

  if (!existsSync(path)) {

    console.error(`Missing ${path}. Run eval first.`);

    process.exit(1);

  }

  return JSON.parse(readFileSync(path, "utf-8"));

}



const a = loadMetrics(expA);

const b = loadMetrics(expB);



console.log("\n=== IntegraGuard Eval Comparison ===\n");

console.log("| Metric | Baseline | Final | Delta |");

console.log("|--------|----------|-------|-------|");

const rows = [

  ["Weighted F1", a.aggregated.weightedF1, b.aggregated.weightedF1],

  ["Precision", a.aggregated.precision, b.aggregated.precision],

  ["Recall", a.aggregated.recall, b.aggregated.recall],

  ["Unsupported claim rate", a.aggregated.unsupportedClaimRate, b.aggregated.unsupportedClaimRate],

  ["Executable artifact rate", a.aggregated.executableArtifactRate, b.aggregated.executableArtifactRate],

];



for (const [name, va, vb] of rows) {

  const delta = ((vb as number) - (va as number)).toFixed(3);

  const sign = Number(delta) >= 0 ? "+" : "";

  console.log(`| ${name} | ${(va as number).toFixed(3)} | ${(vb as number).toFixed(3)} | ${sign}${delta} |`);

}



if (b.operational) {

  console.log("\n=== Operational (Final) ===\n");

  console.log(`| Scenarios | ${b.operational.scenarioCount} |`);

  console.log(`| Median runtime | ${b.operational.medianRuntimeMs?.toFixed(0)} ms/case |`);

  console.log(`| Total runtime | ${(b.operational.totalRuntimeMs / 1000).toFixed(1)} s |`);

  console.log(`| Verifier retries | ${b.operational.totalVerifierRetries} |`);

  console.log(`| Cost per case | $${b.operational.costPerCaseUsd?.toFixed(4)} |`);

}



console.log(`\nBaseline experiment: ${expA}`);

console.log(`Final experiment: ${expB}`);


