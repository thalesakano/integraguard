import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ReadinessPack, TrajectoryEvent, AnalysisInput, ProbePlan } from "@integraguard/schemas";
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
  workflowCheckpoint?: SerializableWorkflowState;
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = join(process.cwd(), "..", "..", "runs", "analyses");

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function runPath(id: string) {
  return join(DATA_DIR, `${id}.json`);
}

export function saveRun(run: StoredRun): void {
  ensureDir();
  run.updatedAt = new Date().toISOString();
  writeFileSync(runPath(run.id), JSON.stringify(run, null, 2));
}

export function getRun(id: string): StoredRun | null {
  ensureDir();
  const path = runPath(id);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as StoredRun;
}

export function listRuns(): StoredRun[] {
  ensureDir();
  return readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(DATA_DIR, f), "utf-8")) as StoredRun)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
