import { NextResponse } from "next/server";
import { AnalysisInputSchema, generateId } from "@integraguard/schemas";
import { runIntegraGuardWorkflow, runViaLangGraph } from "@integraguard/workflow";
import { resolveExecutionHeaders } from "@integraguard/tools";
import { saveRun, getRun, type StoredRun } from "@/lib/store";
import { normalizeAnalysisRequest } from "@/lib/normalize-analysis-request";
import { demoModeTargetViolation } from "@/lib/deployment-mode";

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = AnalysisInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const demoViolation = demoModeTargetViolation(parsed.data.sandboxUrl, parsed.data.scenarioId);
  if (demoViolation) {
    return NextResponse.json({ error: demoViolation }, { status: 403 });
  }

  const normalized = normalizeAnalysisRequest({
    targetMode: parsed.data.targetMode,
    sandboxUrl: parsed.data.sandboxUrl,
    allowedHosts: parsed.data.allowedHosts ?? body.allowedHosts,
    autoApproveProbes: body.autoApproveProbes,
    scenarioId: parsed.data.scenarioId,
  });
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: normalized.status });
  }

  const { autoApproveProbes, allowedHosts } = normalized;
  const useLangGraph = body.useLangGraph === true;
  const useLlm = body.useLlm === true;

  const input = {
    ...parsed.data,
    allowedHosts,
    useLlm: useLlm || undefined,
  };

  const id = generateId("run");
  const run: StoredRun = {
    id,
    input,
    status: "running",
    trajectories: [],
    pendingProbeIds: [],
    autoApproveProbes,
    useLangGraph,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveRun(run);

  const executionHeaders = resolveExecutionHeaders(input.credentialEnvRefs);
  runWorkflowAsync(id, input, {
    autoApproveProbes,
    useLangGraph,
    useLlm,
    executionHeaders,
  }).catch(console.error);

  return NextResponse.json({ id, status: "running", autoApproveProbes, allowedHosts });
}

async function runWorkflowAsync(
  id: string,
  input: import("@integraguard/schemas").AnalysisInput,
  opts: {
    autoApproveProbes: boolean;
    useLangGraph: boolean;
    useLlm: boolean;
    executionHeaders?: Record<string, string>;
  }
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
      executionHeaders: opts.executionHeaders,
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
