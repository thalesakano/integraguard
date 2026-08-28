import { NextResponse } from "next/server";
import { AnalysisInputSchema, generateId } from "@integraguard/schemas";
import { runIntegraGuardWorkflow, runViaLangGraph } from "@integraguard/workflow";
import { saveRun, getRun, type StoredRun } from "@/lib/store";

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = AnalysisInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const autoApproveProbes = body.autoApproveProbes !== false;
  const useLangGraph = body.useLangGraph === true;
  const useLlm = body.useLlm === true;

  const id = generateId("run");
  const run: StoredRun = {
    id,
    input: { ...parsed.data, useLlm: useLlm || undefined },
    status: "running",
    trajectories: [],
    pendingProbeIds: [],
    autoApproveProbes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveRun(run);

  runWorkflowAsync(id, { ...parsed.data, useLlm: useLlm || undefined }, { autoApproveProbes, useLangGraph, useLlm }).catch(console.error);

  return NextResponse.json({ id, status: "running", autoApproveProbes });
}

async function runWorkflowAsync(
  id: string,
  input: import("@integraguard/schemas").AnalysisInput,
  opts: { autoApproveProbes: boolean; useLangGraph: boolean; useLlm: boolean }
) {
  const { saveRun: save } = await import("@/lib/store");

  const onEvent = (ev: import("@integraguard/schemas").TrajectoryEvent) => {
    const current = getRun(id);
    if (current) {
      current.trajectories.push(ev);
      save(current);
    }
  };

  try {
    const runner = opts.useLangGraph ? runViaLangGraph : runIntegraGuardWorkflow;
    const result = await runner(input, {
      autoApproveProbes: opts.autoApproveProbes,
      useLlm: opts.useLlm,
      onEvent,
    });

    const run = getRun(id);
    if (!run) return;

    run.trajectories = result.trajectories;
    run.workflowCheckpoint = result.checkpoint;

    if (result.paused) {
      run.status = "awaiting_approval";
      run.pendingProbes = result.state.pendingApprovals;
      run.pendingProbeIds = result.state.pendingApprovals.map((p) => p.id);
    } else {
      run.status = "completed";
      run.pack = result.pack;
      run.pendingProbes = [];
      run.pendingProbeIds = [];
    }
    save(run);
  } catch (err) {
    const run = getRun(id);
    if (run) {
      run.status = "failed";
      save(run);
    }
    throw err;
  }
}
