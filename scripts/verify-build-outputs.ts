/**
 * Verifies that workspace packages produced expected build artifacts.
 * Fails if `pnpm build` claimed success without compiling packages.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

const REQUIRED_OUTPUTS = [
  "packages/schemas/dist/index.js",
  "packages/tools/dist/index.js",
  "packages/agents/dist/index.js",
  "packages/workflow/dist/index.js",
  "packages/evaluator/dist/index.js",
  "packages/artifact-builder/dist/index.js",
  "sandbox/dist/server.js",
  "packages/cli/dist/index.js",
];

const missing = REQUIRED_OUTPUTS.filter((rel) => !existsSync(join(ROOT, rel)));

if (missing.length > 0) {
  console.error("verify-build-outputs FAILED — missing artifacts:");
  for (const m of missing) console.error(`  - ${m}`);
  console.error("\nRun: pnpm build");
  process.exit(1);
}

console.log(`verify-build-outputs OK — ${REQUIRED_OUTPUTS.length} artifacts present`);
