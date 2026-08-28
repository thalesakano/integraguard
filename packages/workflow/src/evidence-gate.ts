import type {
  Evidence,
  Finding,
  ReadinessDecision,
  ReadinessPack,
  Requirement,
  ContractMapping,
  ProbePlan,
  HttpProbeResult,
  TrajectoryEvent,
} from "@integraguard/schemas";

const RUNTIME_BLOCKER_TYPES = new Set([
  "undocumented-required-field",
  "business-error-inside-http-200",
  "schema-divergent",
  "auth-divergent",
  "endpoint-not-found",
  "missing-idempotency",
  "rate-limit-undocumented",
  "pagination-inconsistent",
]);

export interface EvidenceGateInput {
  findings: Finding[];
  evidences: Evidence[];
  requirements: Requirement[];
}

export interface EvidenceGateResult {
  verifiedFindings: Finding[];
  rejectedFindings: Finding[];
  decision: ReadinessDecision;
  readinessScore: number;
  unansweredQuestions: string[];
}

function mergeDuplicates(findings: Finding[]): Finding[] {
  const map = new Map<string, Finding>();
  for (const f of findings) {
    const key = `${f.requirementId}:${f.blockerType ?? f.description.slice(0, 40)}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, f);
    } else {
      existing.evidenceIds = [...new Set([...existing.evidenceIds, ...f.evidenceIds])];
      if (f.severity === "critical") existing.severity = "critical";
    }
  }
  return [...map.values()];
}

export function runEvidenceGate(input: EvidenceGateInput): EvidenceGateResult {
  const evidenceMap = new Map(input.evidences.map((e) => [e.id, e]));
  const merged = mergeDuplicates(input.findings);
  const verifiedFindings: Finding[] = [];
  const rejectedFindings: Finding[] = [];
  const unansweredQuestions: string[] = [];

  for (const finding of merged) {
    const linked = finding.evidenceIds.map((id) => evidenceMap.get(id)).filter(Boolean) as Evidence[];

    if (linked.length === 0) {
      rejectedFindings.push({ ...finding, status: "rejected" });
      unansweredQuestions.push(`Unverified: ${finding.description}`);
      continue;
    }

    const hasHttp = linked.some((e) => e.type === "http_probe");
    const isRuntime = RUNTIME_BLOCKER_TYPES.has(finding.blockerType ?? "");

    if (isRuntime && !hasHttp) {
      rejectedFindings.push({ ...finding, status: "rejected" });
      unansweredQuestions.push(`Needs HTTP probe evidence: ${finding.description}`);
      continue;
    }

    verifiedFindings.push({ ...finding, status: "verified" });
  }

  const criticalCount = verifiedFindings.filter((f) => f.severity === "critical").length;
  const majorCount = verifiedFindings.filter((f) => f.severity === "major").length;

  let decision: ReadinessDecision = "READY";
  if (criticalCount > 0) decision = "BLOCKED";
  else if (majorCount > 0 || verifiedFindings.length > 0) decision = "CONDITIONAL";

  const penalty = criticalCount * 25 + majorCount * 10 + rejectedFindings.length * 5;
  const readinessScore = Math.max(0, Math.min(100, 100 - penalty));

  const coveredReqs = new Set(verifiedFindings.map((f) => f.requirementId));
  for (const req of input.requirements) {
    if (!coveredReqs.has(req.id) && req.severity === "critical") {
      unansweredQuestions.push(`Requirement ${req.id} not fully validated: ${req.description}`);
    }
  }

  return {
    verifiedFindings,
    rejectedFindings,
    decision,
    readinessScore,
    unansweredQuestions: [...new Set(unansweredQuestions)],
  };
}

export function buildReadinessPack(
  runId: string,
  gate: EvidenceGateResult,
  requirements: Requirement[],
  mappings: ContractMapping[],
  evidences: Evidence[],
  allFindings: Finding[]
): ReadinessPack {
  return {
    runId,
    decision: gate.decision,
    readinessScore: gate.readinessScore,
    requirements,
    findings: [...gate.verifiedFindings, ...gate.rejectedFindings.map((f) => ({ ...f, status: "rejected" as const }))],
    evidences,
    unansweredQuestions: gate.unansweredQuestions,
    mappings,
    generatedAt: new Date().toISOString(),
  };
}

export type WorkflowState = {
  runId: string;
  input: import("@integraguard/schemas").AnalysisInput;
  requirements: Requirement[];
  mappings: ContractMapping[];
  probePlans: ProbePlan[];
  probeResults: HttpProbeResult[];
  evidences: Evidence[];
  candidateFindings: Finding[];
  verifiedFindings: Finding[];
  trajectories: TrajectoryEvent[];
  retries: Record<string, number>;
  pendingApprovals: ProbePlan[];
  approvedProbeIds: Set<string>;
  status: "running" | "awaiting_approval" | "completed" | "failed";
  pack?: ReadinessPack;
};

export function emitTrajectory(
  state: WorkflowState,
  agent: string,
  action: string,
  extra?: Partial<TrajectoryEvent>
): TrajectoryEvent {
  const event: TrajectoryEvent = {
    runId: state.runId,
    agent,
    instructionVersion: "v1",
    action,
    retry: extra?.retry ?? 0,
    timestamp: new Date().toISOString(),
    ...extra,
  };
  state.trajectories.push(event);
  return event;
}
