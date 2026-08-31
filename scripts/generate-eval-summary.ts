/**
 * Generates a stable Markdown summary from eval metrics JSONs.
 * Used to keep README / UI / demo-script / slide in sync with one run.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const runsDir = join(ROOT, "runs");

function loadMetrics(experiment: string) {
  const path = join(runsDir, experiment, "metrics.json");
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}. Run pnpm eval:baseline / pnpm eval:final first.`);
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function buildEvalSummaryMarkdown(
  baseline: ReturnType<typeof loadMetrics>,
  final: ReturnType<typeof loadMetrics>
): string {
  const b = baseline.aggregated;
  const f = final.aggregated;
  const op = final.operational ?? {};
  const delta = (x: number, y: number) => {
    const d = y - x;
    return `${d >= 0 ? "+" : ""}${d.toFixed(3)}`;
  };

  const caseRows =
    final.results
      ?.map(
        (r: { caseId: string; metrics: { weightedF1: number }; runtimeMs?: number }) =>
          `| ${r.caseId} | ${r.metrics.weightedF1.toFixed(3)} | ${r.runtimeMs ?? "—"} |`
      )
      .join("\n") ?? "";

  return `<!-- EVAL_SUMMARY_START -->
## Measured Results (auto-synced)

| Metric | V0 Baseline | V4 Final | Δ |
|--------|-------------|----------|---|
| Weighted F1 | ${b.weightedF1.toFixed(3)} | **${f.weightedF1.toFixed(3)}** | ${delta(b.weightedF1, f.weightedF1)} |
| Precision | ${b.precision.toFixed(3)} | ${f.precision.toFixed(3)} | ${delta(b.precision, f.precision)} |
| Recall | ${b.recall.toFixed(3)} | ${f.recall.toFixed(3)} | ${delta(b.recall, f.recall)} |
| Unsupported claim rate | ${b.unsupportedClaimRate.toFixed(3)} | **${f.unsupportedClaimRate.toFixed(3)}** | ${delta(b.unsupportedClaimRate, f.unsupportedClaimRate)} |
| Median runtime (ms/case) | — | ${op.medianRuntimeMs ?? "—"} | — |
| Cost per case (USD) | — | ${op.costPerCaseUsd ?? 0} | — |

Run id: \`${final.experiment}\` · scenarios: ${op.scenarioCount ?? final.results?.length ?? "—"} · generated: ${new Date().toISOString()}

### Per-scenario F1 (final)

| Case | F1 | Runtime ms |
|------|----|------------|
${caseRows}
<!-- EVAL_SUMMARY_END -->`;
}

function replaceOrAppend(content: string, block: string): string {
  if (content.includes("<!-- EVAL_SUMMARY_START -->")) {
    return content.replace(
      /<!-- EVAL_SUMMARY_START -->[\s\S]*?<!-- EVAL_SUMMARY_END -->/,
      block
    );
  }
  return `${content.trimEnd()}\n\n${block}\n`;
}

function main() {
  const write = process.argv.includes("--write");
  const writeDocs = process.argv.includes("--write-docs");
  const baseline = loadMetrics("v0-baseline");
  const final = loadMetrics("v4-evidence-gate");
  const summary = buildEvalSummaryMarkdown(baseline, final);

  console.log(summary);

  // Always refresh the canonical summary file when --write is set
  if (write) {
    writeFileSync(join(ROOT, "docs", "eval-summary.md"), `${summary}\n`);
    console.log("Updated docs/eval-summary.md");
  }

  // Only patch README/slide/demo when explicitly requested AND full suite looks complete
  if (writeDocs) {
    const n = final.results?.length ?? 0;
    if (n < 12) {
      console.error(
        `Refusing --write-docs: final metrics cover ${n} scenarios (need ≥12). Re-run full pnpm eval:final.`
      );
      process.exit(1);
    }
    for (const path of [
      join(ROOT, "README.md"),
      join(ROOT, "docs", "submission-slide.md"),
      join(ROOT, "docs", "demo-script.md"),
    ]) {
      if (!existsSync(path)) continue;
      writeFileSync(path, replaceOrAppend(readFileSync(path, "utf-8"), summary));
      console.log(`Updated ${path}`);
    }
  }

  // Integrity check: documented F1 in summary must match JSON
  const f1Match = summary.match(/\*\*(\d+\.\d+)\*\*/);
  if (f1Match && Number(f1Match[1]) !== Number(final.aggregated.weightedF1.toFixed(3))) {
    console.error("Integrity check failed: F1 mismatch");
    process.exit(1);
  }
  console.log("\nIntegrity OK — summary matches metrics.json");
}

main();
