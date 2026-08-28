import { NextResponse } from "next/server";

import { readFileSync, existsSync } from "node:fs";

import { join } from "node:path";



export async function GET() {

  const runsDir = join(process.cwd(), "..", "..", "runs");

  const baselinePath = join(runsDir, "v0-baseline", "metrics.json");

  const finalPath = join(runsDir, "v4-evidence-gate", "metrics.json");



  if (!existsSync(baselinePath) || !existsSync(finalPath)) {

    return NextResponse.json({

      available: false,

      message: "Run pnpm eval:baseline and pnpm eval:final to generate metrics",

    });

  }



  const baseline = JSON.parse(readFileSync(baselinePath, "utf-8"));

  const final = JSON.parse(readFileSync(finalPath, "utf-8"));



  return NextResponse.json({

    available: true,

    baseline: baseline.aggregated,

    final: final.aggregated,

    operational: final.operational ?? null,

    baselineExperiment: baseline.experiment,

    finalExperiment: final.experiment,

    caseResults: final.results?.map(

      (r: { caseId: string; metrics: { weightedF1: number }; runtimeMs?: number }) => ({

        caseId: r.caseId,

        f1: r.metrics.weightedF1,

        runtimeMs: r.runtimeMs,

      })

    ),

  });

}


