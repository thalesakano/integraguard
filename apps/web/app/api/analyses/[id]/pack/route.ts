import { NextResponse } from "next/server";
import { getRun } from "@/lib/store";
import { buildReport } from "@integraguard/artifact-builder";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const run = getRun(id);
  if (!run?.pack) return NextResponse.json({ error: "Pack not ready" }, { status: 404 });

  const verified = run.pack.findings.filter((f) => f.status === "verified");
  const endpoints = Array.from(
    new Map(
      run.pack.mappings.map((m) => [`${m.method} ${m.endpoint}`, { method: m.method, path: m.endpoint }])
    ).values()
  );

  return NextResponse.json({
    ...run.pack,
    reportPreview: buildReport(run.pack, {
      goal: run.input.goal,
      sampleRequest: run.input.sampleRequest,
    }),
    runSummary: {
      goal: run.input.goal,
      sandboxUrl: run.input.sandboxUrl,
      targetMode: run.input.targetMode ?? "sandbox",
      scenarioId: run.input.scenarioId,
      endpointCount: endpoints.length,
      endpoints,
      requirementCount: run.pack.requirements.length,
      verifiedFindingCount: verified.length,
      criticalCount: verified.filter((f) => f.severity === "critical").length,
      majorCount: verified.filter((f) => f.severity === "major").length,
      unansweredCount: run.pack.unansweredQuestions.length,
      mappingCount: run.pack.mappings.length,
    },
  });
}
