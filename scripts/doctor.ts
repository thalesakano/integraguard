/**
 * IntegraGuard doctor — quick environment / build / sandbox checks.
 *
 * Usage: pnpm doctor
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIN_NODE_MAJOR = 20;

type Check = { name: string; ok: boolean; detail: string };

function checkNode(): Check {
  const major = Number(process.versions.node.split(".")[0]);
  return {
    name: "Node.js version",
    ok: major >= MIN_NODE_MAJOR,
    detail: `v${process.versions.node} (need >=${MIN_NODE_MAJOR})`,
  };
}

function checkArtifact(rel: string, label: string): Check {
  const path = join(ROOT, rel);
  return {
    name: label,
    ok: existsSync(path),
    detail: existsSync(path) ? `found ${rel}` : `missing ${rel} — run pnpm build`,
  };
}

async function checkSandbox(): Promise<Check> {
  const url = process.env.INTEGRAGUARD_SANDBOX_URL ?? "http://127.0.0.1:4000/health";
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    return {
      name: "Sandbox health (:4000)",
      ok: res.ok,
      detail: res.ok ? `OK ${url}` : `HTTP ${res.status} from ${url}`,
    };
  } catch (err) {
    return {
      name: "Sandbox health (:4000)",
      ok: false,
      detail: `unreachable — ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function main() {
  console.log("IntegraGuard doctor\n");

  const checks: Check[] = [
    checkNode(),
    checkArtifact("packages/schemas/dist/index.js", "schemas build"),
    checkArtifact("packages/tools/dist/index.js", "tools build"),
    checkArtifact("packages/workflow/dist/index.js", "workflow build"),
    checkArtifact("packages/cli/dist/index.js", "cli build"),
    await checkSandbox(),
  ];

  let failed = 0;
  for (const c of checks) {
    const mark = c.ok ? "PASS" : "FAIL";
    console.log(`  [${mark}] ${c.name}: ${c.detail}`);
    if (!c.ok) failed += 1;
  }

  console.log("\nNext steps:");
  if (!checks[0]?.ok) {
    console.log("  - Install Node.js 20+ (https://nodejs.org/)");
  }
  if (checks.slice(1, 5).some((c) => !c.ok)) {
    console.log("  - pnpm install && pnpm build");
  }
  if (!checks[5]?.ok) {
    console.log("  - Start sandbox: pnpm sandbox   (or docker compose up -d)");
    console.log("  - Confirm http://localhost:4000/health");
  }
  console.log("  - UI: pnpm dev");
  console.log("  - CLI: pnpm integraguard check --config integraguard.config.example.yaml --safe");
  console.log("  - Verify: pnpm verify:build && pnpm test");
  if (process.env.DEMO_MODE || process.env.INTEGRAGUARD_DEMO_MODE) {
    console.log("  - Demo mode is ON (localhost / scenario targets only)");
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
