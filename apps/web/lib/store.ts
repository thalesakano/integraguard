import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ReadinessPack, TrajectoryEvent, AnalysisInput, ProbePlan } from "@integraguard/schemas";
import { redactSecrets, redactHeaders } from "@integraguard/tools";
import type { SerializableWorkflowState } from "@integraguard/workflow";

export interface StoredRun {
  id: string;
  input: AnalysisInput;
  status: "running" | "awaiting_approval" | "completed" | "failed";
  pack?: ReadinessPack;
  trajectories: TrajectoryEvent[];
  pendingProbeIds: string[];
  pendingProbes?: ProbePlan[];
  autoApproveProbes?: boolean;
  useLangGraph?: boolean;
  workflowCheckpoint?: SerializableWorkflowState;
  createdAt: string;
  updatedAt: string;
}

export const MAX_TRAJECTORY_EVENTS = 500;
export const MAX_PACK_JSON_BYTES = 2 * 1024 * 1024;

function resolveDataDir(): string {
  if (process.env.INTEGRAGUARD_RUNS_DIR) return process.env.INTEGRAGUARD_RUNS_DIR;
  const cwd = process.cwd().replace(/\\/g, "/");
  // Next.js server cwd is apps/web
  if (cwd.endsWith("/apps/web") || existsSync(join(process.cwd(), "next.config.ts"))) {
    return join(process.cwd(), "..", "..", "runs", "analyses");
  }
  return join(process.cwd(), "runs", "analyses");
}

function ensureDir() {
  const dir = resolveDataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function runPath(id: string) {
  return join(ensureDir(), `${id}.json`);
}

type InputWithOptionalHeaders = AnalysisInput & {
  headers?: Record<string, string>;
};

/** Redact secrets and enforce size limits before persistence. */
export function sanitizeRunForStorage(run: StoredRun): StoredRun {
  const extraFields = run.input.redactionFields ?? [];
  const rawInput = run.input as InputWithOptionalHeaders;
  const input: InputWithOptionalHeaders = {
    ...rawInput,
    sampleRequest: rawInput.sampleRequest
      ? redactSecrets(rawInput.sampleRequest, { extraFields })
      : rawInput.sampleRequest,
    sampleResponse: rawInput.sampleResponse
      ? redactSecrets(rawInput.sampleResponse, { extraFields })
      : rawInput.sampleResponse,
  };
  if (rawInput.headers) {
    input.headers = redactHeaders(rawInput.headers, { extraFields });
  }

  let trajectories = run.trajectories ?? [];
  if (trajectories.length > MAX_TRAJECTORY_EVENTS) {
    trajectories = trajectories.slice(trajectories.length - MAX_TRAJECTORY_EVENTS);
  }

  let pack = run.pack;
  if (pack) {
    const bytes = Buffer.byteLength(JSON.stringify(pack), "utf8");
    if (bytes > MAX_PACK_JSON_BYTES) {
      throw new Error(
        `Pack exceeds storage limit (${bytes} bytes > ${MAX_PACK_JSON_BYTES}). Rejecting save.`
      );
    }
  }

  return {
    ...run,
    input: input as AnalysisInput,
    trajectories,
    pack,
  };
}

export function saveRun(run: StoredRun): void {
  const sanitized = sanitizeRunForStorage(run);
  sanitized.updatedAt = new Date().toISOString();
  writeFileSync(runPath(sanitized.id), JSON.stringify(sanitized, null, 2));
  Object.assign(run, sanitized);
}

export function getRun(id: string): StoredRun | null {
  const path = runPath(id);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as StoredRun;
}

export function listRuns(): StoredRun[] {
  const dir = ensureDir();
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf-8")) as StoredRun)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
