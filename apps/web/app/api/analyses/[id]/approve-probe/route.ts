import { NextResponse } from "next/server";
import { getRun, saveRun } from "@/lib/store";
import { approveProbeAndContinue } from "@integraguard/workflow";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const run = getRun(id);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { probeId } = await req.json();
  if (!probeId) return NextResponse.json({ error: "probeId required" }, { status: 400 });

  if (!run.workflowCheckpoint) {
    return NextResponse.json({ error: "No checkpoint to resume" }, { status: 400 });
  }

  try {
    const result = await approveProbeAndContinue(run.workflowCheckpoint, probeId, {
      autoApproveProbes: run.autoApproveProbes ?? false,
      useLlm: run.input.useLlm,
      onEvent: (ev) => {
        run.trajectories.push(ev);
        saveRun(run);
      },
    });

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
    run.trajectories = result.trajectories;
    saveRun(run);

    return NextResponse.json({
      approved: probeId,
      status: run.status,
      pendingProbeIds: run.pendingProbeIds,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Resume failed" },
      { status: 500 }
    );
  }
}
