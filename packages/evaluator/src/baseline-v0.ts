import type {
  AnalysisInput,
  Finding,
  Evidence,
  ReadinessPack,
  TrajectoryEvent,
} from "@integraguard/schemas";
import { generateId } from "@integraguard/schemas";
import { httpProbe } from "@integraguard/tools";

export interface BaselineV0Result {
  pack: ReadinessPack;
  trajectories: TrajectoryEvent[];
}

/**
 * Baseline V0: single generalist pass — reads docs only, optional one HTTP call,
 * no structured requirements, no verifier, no evidence gate.
 */
export async function runBaselineV0(
  runId: string,
  input: AnalysisInput
): Promise<BaselineV0Result> {
  const trajectories: TrajectoryEvent[] = [];
  const ts = () => new Date().toISOString();

  trajectories.push({
    runId,
    agent: "baseline-v0-generalist",
    instructionVersion: "v0",
    action: "analyze_documentation",
    reason: "Single-pass generalist analysis",
    retry: 0,
    timestamp: ts(),
  });

  const evidences: Evidence[] = [];
  const findings: Finding[] = [];

  evidences.push({
    id: generateId("EVD"),
    type: "document",
    sourceReference: "api-docs.md",
    observation: "Documentation reviewed in single pass",
    payload: { goal: input.goal },
  });

  // Baseline intentionally misses runtime issues — only surface obvious doc mentions
  if (input.documentation.includes("beneficiaryCard")) {
    findings.push({
      id: generateId("FND"),
      requirementId: "REQ-001",
      severity: "minor",
      status: "unverified",
      evidenceIds: [],
      description: "Documentation mentions beneficiaryCard field",
      blockerType: "schema-divergent",
    });
  }

  // One naive probe without structured planning
  try {
    const probeResult = await httpProbe({
      probeId: generateId("probe"),
      sandboxUrl: input.sandboxUrl,
      method: "POST",
      endpoint: "/v1/pre-authorization",
      body: input.sampleRequest ?? { beneficiaryCard: "123456", procedureCode: "789" },
      timeoutMs: 5000,
    });

    evidences.push({
      id: generateId("EVD"),
      type: "http_probe",
      sourceReference: "POST /v1/pre-authorization",
      observation: `Received HTTP ${probeResult.statusCode}`,
      payload: probeResult,
    });

    trajectories.push({
      runId,
      agent: "baseline-v0-generalist",
      instructionVersion: "v0",
      action: "http_probe",
      toolCallId: probeResult.probeId,
      retry: 0,
      timestamp: ts(),
    });

    // Baseline misses business error in HTTP 200 — only flags 4xx/5xx
    if (probeResult.statusCode >= 400) {
      findings.push({
        id: generateId("FND"),
        requirementId: "REQ-001",
        severity: "major",
        status: "unverified",
        evidenceIds: [evidences[evidences.length - 1]!.id],
        description: `HTTP error ${probeResult.statusCode}`,
      });
    }
  } catch {
    // baseline ignores probe failures silently
  }

  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const decision =
    criticalCount > 0 ? "BLOCKED" : findings.length > 0 ? "CONDITIONAL" : "READY";

  return {
    pack: {
      runId,
      decision,
      readinessScore: decision === "READY" ? 85 : decision === "CONDITIONAL" ? 60 : 40,
      requirements: [{ id: "REQ-001", description: input.goal, severity: "critical" }],
      findings,
      evidences,
      unansweredQuestions: ["Are all required fields documented?"],
      mappings: [],
      generatedAt: ts(),
    },
    trajectories,
  };
}
