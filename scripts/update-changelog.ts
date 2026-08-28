import { readFileSync, writeFileSync, existsSync } from "node:fs";

import { join } from "node:path";



const runsDir = join(process.cwd(), "runs");

const changelogPath = join(process.cwd(), "docs", "improvement-changelog.md");



function loadMetrics(experiment: string) {

  const path = join(runsDir, experiment, "metrics.json");

  if (!existsSync(path)) return null;

  return JSON.parse(readFileSync(path, "utf-8"));

}



const baseline = loadMetrics("v0-baseline");

const final = loadMetrics("v4-evidence-gate");



if (!baseline || !final) {

  console.log("Run pnpm eval:baseline and pnpm eval:final first.");

  process.exit(0);

}



const op = final.operational;

const opLines = op

  ? `

| Median runtime (ms/case) | — | ${op.medianRuntimeMs?.toFixed(0)} | — |

| Verifier retries | — | ${op.totalVerifierRetries} | — |

| Cost per case (USD) | — | ${op.costPerCaseUsd?.toFixed(4)} | — |

`

  : "";



const section = `

## Latest Results (auto-generated)



| Metric | V0 Baseline | V4 Final | Delta |

|--------|-------------|----------|-------|

| Weighted F1 | ${baseline.aggregated.weightedF1.toFixed(3)} | ${final.aggregated.weightedF1.toFixed(3)} | ${(final.aggregated.weightedF1 - baseline.aggregated.weightedF1).toFixed(3)} |

| Precision | ${baseline.aggregated.precision.toFixed(3)} | ${final.aggregated.precision.toFixed(3)} | ${(final.aggregated.precision - baseline.aggregated.precision).toFixed(3)} |

| Recall | ${baseline.aggregated.recall.toFixed(3)} | ${final.aggregated.recall.toFixed(3)} | ${(final.aggregated.recall - baseline.aggregated.recall).toFixed(3)} |

| Unsupported claim rate | ${baseline.aggregated.unsupportedClaimRate.toFixed(3)} | ${final.aggregated.unsupportedClaimRate.toFixed(3)} | ${(final.aggregated.unsupportedClaimRate - baseline.aggregated.unsupportedClaimRate).toFixed(3)} |

${opLines}

Generated: ${new Date().toISOString()}

`;



let content = readFileSync(changelogPath, "utf-8");

if (content.includes("## Latest Results (auto-generated)")) {

  content = content.replace(/\n## Latest Results \(auto-generated\)[\s\S]*?(?=\n## |$)/, section);

} else {

  content += section;

}

writeFileSync(changelogPath, content);

console.log("Updated docs/improvement-changelog.md with latest metrics");


