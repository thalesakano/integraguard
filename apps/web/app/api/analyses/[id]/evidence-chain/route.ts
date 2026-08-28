import { NextResponse } from "next/server";
import { getRun } from "@/lib/store";
import { linkEvidenceChain } from "@integraguard/artifact-builder";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const findingId = new URL(req.url).searchParams.get("findingId");
  const run = getRun(id);
  if (!run?.pack || !findingId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(linkEvidenceChain(findingId, run.pack, run.trajectories));
}
