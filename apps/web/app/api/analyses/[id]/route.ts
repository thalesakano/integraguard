import { NextResponse } from "next/server";
import { getRun } from "@/lib/store";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const run = getRun(id);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: run.id,
    status: run.status,
    trajectories: run.trajectories,
    pack: run.pack,
    pendingProbeIds: run.pendingProbeIds,
    pendingProbes: run.pendingProbes ?? [],
    autoApproveProbes: run.autoApproveProbes,
    useLangGraph: run.useLangGraph,
    input: run.input,
  });
}
