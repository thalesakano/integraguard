import { NextResponse } from "next/server";
import { getRun } from "@/lib/store";
import { buildArtifactZip, linkEvidenceChain } from "@integraguard/artifact-builder";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(req.url);

  if (url.pathname.endsWith("/evidence-chain") || url.searchParams.has("findingId")) {
    const findingId = url.searchParams.get("findingId");
    const run = getRun(id);
    if (!run?.pack || !findingId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(linkEvidenceChain(findingId, run.pack, run.trajectories));
  }

  const run = getRun(id);
  if (!run?.pack) return NextResponse.json({ error: "Pack not ready" }, { status: 404 });

  const zip = await buildArtifactZip(run.pack, run.trajectories, run.input.sandboxUrl);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="integraguard-${id}.zip"`,
    },
  });
}
