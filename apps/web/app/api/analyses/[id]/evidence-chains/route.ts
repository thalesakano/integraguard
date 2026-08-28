import { NextResponse } from "next/server";
import { getRun } from "@/lib/store";
import { buildAllEvidenceChains } from "@integraguard/artifact-builder";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const run = getRun(id);
  if (!run?.pack) {
    return NextResponse.json({ error: "Pack not ready" }, { status: 404 });
  }

  const chains = buildAllEvidenceChains(run.pack, run.trajectories);
  return NextResponse.json({ chains });
}
