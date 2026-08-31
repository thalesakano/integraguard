#!/usr/bin/env node
/**
 * IntegraGuard CLI — local/CI contract drift checks.
 *
 * Exit codes:
 *   0 — READY / no verified drift
 *   1 — verified drift found
 *   2 — execution/configuration error
 *   3 — inconclusive / paused awaiting approval
 */
import {
  loadProjectConfig,
  configToAnalysisInput,
  resolveConfigSources,
  resolveExecutionHeaders,
  loadDocumentationSource,
  buildContractSnapshot,
  diffContractSnapshots,
  type ContractSnapshot,
} from "@integraguard/tools";
import { runIntegraGuardWorkflow, runAgenticContractWorkflow } from "@integraguard/workflow";
import { buildCiReports } from "@integraguard/artifact-builder";
import type { AnalysisInput, ReadinessPack } from "@integraguard/schemas";
import { exitCodeForPack } from "./exit-code.js";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
export { exitCodeForPack } from "./exit-code.js";

function isHttpLike(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function usage(): never {
  console.log(`IntegraGuard CLI

Usage:
  integraguard check --config <path> [--agentic] [--safe] [--out <dir>]
  integraguard check --docs <url-or-file> --target <base-url> [--safe]
  integraguard snapshot --config <path> --out <file>
  integraguard check --baseline <snapshot.json> --config <path>
  integraguard replay <run.json>

Exit codes: 0 ready | 1 drift | 2 error | 3 inconclusive
`);
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  return { args, positional };
}

function exitForPack(pack: ReadinessPack, paused: boolean): never {
  const code = exitCodeForPack(pack, paused);
  if (code === 3) {
    console.error(
      paused
        ? "INCONCLUSIVE: workflow paused for human approval (use UI or --safe with GET-only)."
        : `INCONCLUSIVE: decision=${pack.decision} unanswered=${pack.unansweredQuestions.length}`
    );
    process.exit(3);
  }
  if (code === 1) {
    const drifts = pack.findings.filter((f) => f.status === "verified");
    console.error(`DRIFT: ${drifts.length} verified mismatch(es). Decision=${pack.decision}`);
    process.exit(1);
  }
  console.log(`READY: decision=${pack.decision} score=${pack.readinessScore}`);
  process.exit(0);
}

async function cmdCheck(args: Record<string, string | boolean>) {
  const outDir = resolve(String(args.out ?? "integraguard-out"));
  mkdirSync(outDir, { recursive: true });

  let input: AnalysisInput;
  let autoApprove = Boolean(args.safe) || false;
  let executionHeaders: Record<string, string> = {};

  if (args.config) {
    const cfg = loadProjectConfig(String(args.config));
    const resolved = await resolveConfigSources(cfg);
    input = configToAnalysisInput(cfg, resolved);
    executionHeaders = resolveExecutionHeaders(input.credentialEnvRefs);
    autoApprove = autoApprove || cfg.policy.autoApproveProbes;
    if (args.safe) {
      input = {
        ...input,
        allowedOperations: (input.allowedOperations ?? []).filter((m) =>
          ["GET", "HEAD", "OPTIONS"].includes(m.toUpperCase())
        ),
      };
      if (input.allowedOperations.length === 0) input.allowedOperations = ["GET"];
    }
  } else if (args.docs && args.target) {
    const docsPath = String(args.docs);
    const target = String(args.target).replace(/\/?$/, "/");
    const targetHost = new URL(target).hostname;
    const loaded = await loadDocumentationSource(docsPath, {
      allowedHosts: [targetHost, ...(isHttpLike(docsPath) ? [new URL(docsPath).hostname] : [])],
    });
    for (const w of loaded.warnings) console.error(`[docs] ${w}`);
    input = {
      goal: "Validate API contract",
      documentation: loaded.documentation,
      openApiSpec: loaded.openApiSpec,
      sampleRequest: {},
      sandboxUrl: target,
      allowedOperations: args.safe ? ["GET"] : ["GET", "POST"],
      allowedHosts: [targetHost],
      targetMode: "custom",
    };
    autoApprove = Boolean(args.safe);
  } else {
    usage();
  }

  const runner = args.agentic ? runAgenticContractWorkflow : runIntegraGuardWorkflow;
  const result = await runner(input!, {
    autoApproveProbes: autoApprove,
    useLlm: Boolean(args.llm),
    executionHeaders,
  });

  if (!result.pack && result.paused) {
    writeFileSync(join(outDir, "checkpoint.json"), JSON.stringify(result.checkpoint, null, 2));
    exitForPack(
      {
        runId: result.checkpoint.runId,
        decision: "CONDITIONAL",
        readinessScore: 0,
        requirements: [],
        findings: [],
        evidences: [],
        unansweredQuestions: ["Awaiting human probe approval"],
        mappings: [],
        generatedAt: new Date().toISOString(),
      },
      true
    );
  }

  const pack = result.pack!;
  const reports = buildCiReports(pack, result.trajectories);
  for (const [name, content] of Object.entries(reports)) {
    writeFileSync(join(outDir, name), content);
  }
  writeFileSync(join(outDir, "run.json"), JSON.stringify(result, null, 2));
  console.log(`Reports written to ${outDir}`);

  if (args.baseline && existsSync(String(args.baseline))) {
    const baseline = JSON.parse(readFileSync(String(args.baseline), "utf-8")) as ContractSnapshot;
    const current = buildContractSnapshot({
      targetBaseUrl: input!.sandboxUrl,
      endpoints: pack.mappings.map((m) => ({
        method: m.method,
        path: m.endpoint,
        requestShape: input!.sampleRequest,
      })),
    });
    const diff = diffContractSnapshots(baseline, current);
    if (diff.changed) {
      console.error("Baseline drift:\n" + diff.details.map((d) => `  - ${d}`).join("\n"));
      writeFileSync(join(outDir, "baseline-diff.json"), JSON.stringify(diff, null, 2));
      process.exit(1);
    }
  }

  exitForPack(pack, result.paused);
}

async function cmdSnapshot(args: Record<string, string | boolean>) {
  if (!args.config || !args.out) usage();
  const cfg = loadProjectConfig(String(args.config));
  const resolved = await resolveConfigSources(cfg);
  const input = configToAnalysisInput(cfg, {
    ...resolved,
    // Snapshot defaults to read-only operations
    allowedOperations: ["GET", "HEAD", "OPTIONS"],
  });
  const result = await runIntegraGuardWorkflow(input, {
    autoApproveProbes: true,
    executionHeaders: resolveExecutionHeaders(input.credentialEnvRefs),
  });
  const pack = result.pack;
  if (!pack) {
    console.error("Snapshot failed: no pack produced");
    process.exit(2);
  }
  const snap = buildContractSnapshot({
    targetBaseUrl: cfg.target.baseUrl,
    endpoints: pack.mappings.map((m) => ({
      method: m.method,
      path: m.endpoint,
      requestShape: input.sampleRequest,
      statusCodes: pack.evidences
        .filter((e) => e.type === "http_probe")
        .map((e) => (e.payload as { statusCode?: number })?.statusCode)
        .filter((c): c is number => typeof c === "number"),
    })),
  });
  const out = resolve(String(args.out));
  mkdirSync(join(out, ".."), { recursive: true });
  writeFileSync(out, JSON.stringify(snap, null, 2));
  console.log(`Snapshot written to ${out} (fingerprint ${snap.fingerprint})`);
  process.exit(0);
}

async function cmdReplay(path: string) {
  if (!existsSync(path)) {
    console.error(`Missing ${path}`);
    process.exit(2);
  }
  const data = JSON.parse(readFileSync(path, "utf-8")) as {
    pack?: ReadinessPack;
    trajectories?: unknown;
  };
  if (!data.pack) {
    console.error("replay file has no pack");
    process.exit(2);
  }
  console.log(`[replay] decision=${data.pack.decision} findings=${data.pack.findings.length}`);
  console.log("Note: replay is labeled offline — not a live probe run.");
  exitForPack(data.pack, false);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) usage();
  const cmd = argv[0]!;
  const { args, positional } = parseArgs(argv.slice(1));

  try {
    if (cmd === "check") await cmdCheck(args);
    else if (cmd === "snapshot") await cmdSnapshot(args);
    else if (cmd === "replay") await cmdReplay(positional[0] ?? String(args._ ?? ""));
    else usage();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(2);
  }
}

main();
