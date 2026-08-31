import {
  generateId,
  parseAgenticCheckpoint,
  type AgenticCheckpoint,
  type AnalysisInput,
  type ContractDrift,
  type DocumentedExpectation,
  type Evidence,
  type Finding,
  type ProbePlan,
  type HttpProbeResult,
  type TrajectoryEvent,
  type Requirement,
  type ContractMapping,
  type ReadinessPack,
} from "@integraguard/schemas";

export const AGENTIC_INSTRUCTION_VERSION = "v2";

export interface AgenticState {
  runId: string;
  input: AnalysisInput;
  useLlm: boolean;
  autoApprove: boolean;
  /** Non-serializable probe credentials — not written to AnalysisInput. */
  executionHeaders?: Record<string, string>;
  maxProbes: number;
  probesUsed: number;
  loopCount: number;
  maxLoops: number;
  expectations: DocumentedExpectation[];
  probePlans: ProbePlan[];
  probeQueue: ProbePlan[];
  pendingApprovals: ProbePlan[];
  approvedProbeIds: string[];
  probeResults: HttpProbeResult[];
  observations: {
    probeId: string;
    expectationId: string;
    statusCode: number;
    body: unknown;
    error?: string;
    durationMs: number;
  }[];
  driftCandidates: ContractDrift[];
  evidences: Evidence[];
  requirements: Requirement[];
  mappings: ContractMapping[];
  candidateFindings: Finding[];
  verifiedFindings: Finding[];
  trajectories: TrajectoryEvent[];
  needsMoreProbes: boolean;
  lastProbePurpose?: string;
  status: "running" | "awaiting_approval" | "completed" | "failed";
  route: "continue" | "approve" | "loop" | "gate" | "end";
  /** Optional pack attached at gate — not always present mid-run. */
  pack?: ReadinessPack;
}

/**
 * Serialize agentic state for durable checkpoints.
 * Strips executionHeaders and any non-serializable secrets.
 */
export function serializeAgenticCheckpoint(state: AgenticState): AgenticCheckpoint {
  const { executionHeaders: _secrets, ...rest } = state;
  void _secrets;
  return parseAgenticCheckpoint({
    ...rest,
    instructionVersion: AGENTIC_INSTRUCTION_VERSION,
    pack: state.pack,
  });
}

/** Restore AgenticState from a durable checkpoint (no secrets). */
export function restoreAgenticStateFromCheckpoint(
  checkpoint: AgenticCheckpoint,
  opts?: { executionHeaders?: Record<string, string>; autoApprove?: boolean; useLlm?: boolean }
): AgenticState {
  const parsed = parseAgenticCheckpoint(checkpoint);
  return {
    runId: parsed.runId,
    input: parsed.input,
    useLlm: opts?.useLlm ?? parsed.useLlm,
    autoApprove: opts?.autoApprove ?? parsed.autoApprove,
    executionHeaders: opts?.executionHeaders,
    maxProbes: parsed.maxProbes,
    probesUsed: parsed.probesUsed,
    loopCount: parsed.loopCount,
    maxLoops: parsed.maxLoops,
    expectations: parsed.expectations,
    probePlans: parsed.probePlans,
    probeQueue: parsed.probeQueue,
    pendingApprovals: parsed.pendingApprovals,
    approvedProbeIds: [...parsed.approvedProbeIds],
    probeResults: parsed.probeResults,
    observations: parsed.observations.map((o) => ({
      probeId: o.probeId,
      expectationId: o.expectationId,
      statusCode: o.statusCode,
      body: o.body ?? null,
      error: o.error,
      durationMs: o.durationMs,
    })),
    driftCandidates: parsed.driftCandidates,
    evidences: parsed.evidences,
    requirements: parsed.requirements,
    mappings: parsed.mappings,
    candidateFindings: parsed.candidateFindings,
    verifiedFindings: parsed.verifiedFindings,
    trajectories: [...parsed.trajectories],
    needsMoreProbes: parsed.needsMoreProbes,
    lastProbePurpose: parsed.lastProbePurpose,
    status: parsed.status,
    route: parsed.route,
    pack: parsed.pack,
  };
}

export { parseAgenticCheckpoint };

export function createAgenticState(
  input: AnalysisInput,
  opts: {
    useLlm?: boolean;
    autoApprove?: boolean;
    maxProbes?: number;
    executionHeaders?: Record<string, string>;
  } = {}
): AgenticState {
  return {
    runId: generateId("run"),
    input,
    useLlm: opts.useLlm ?? false,
    autoApprove: opts.autoApprove ?? true,
    executionHeaders: opts.executionHeaders,
    maxProbes: opts.maxProbes ?? input.maxProbes ?? 8,
    probesUsed: 0,
    loopCount: 0,
    maxLoops: 2,
    expectations: [],
    probePlans: [],
    probeQueue: [],
    pendingApprovals: [],
    approvedProbeIds: [],
    probeResults: [],
    observations: [],
    driftCandidates: [],
    evidences: [],
    requirements: [],
    mappings: [],
    candidateFindings: [],
    verifiedFindings: [],
    trajectories: [],
    needsMoreProbes: false,
    status: "running",
    route: "continue",
  };
}

export function emitAgenticTrajectory(
  state: AgenticState,
  agent: string,
  action: string,
  extra?: Partial<TrajectoryEvent>
): TrajectoryEvent {
  const event: TrajectoryEvent = {
    runId: state.runId,
    agent,
    instructionVersion: extra?.instructionVersion ?? "v2",
    action,
    retry: extra?.retry ?? 0,
    timestamp: new Date().toISOString(),
    ...extra,
  };
  state.trajectories.push(event);
  return event;
}

export function expectationsToRequirements(expectations: DocumentedExpectation[]): Requirement[] {
  const byCategory = new Map<string, DocumentedExpectation>();
  for (const e of expectations) {
    if (!byCategory.has(e.category)) byCategory.set(e.category, e);
  }
  const severity = (cat: string): Requirement["severity"] =>
    ["authentication", "request-schema", "status-semantics"].includes(cat) ? "critical" : "major";

  return [...byCategory.entries()].map(([cat, e], i) => ({
    id: `REQ-${String(i + 1).padStart(3, "0")}`,
    description: e.statement,
    severity: severity(cat),
  }));
}

export function driftsToFindings(
  drifts: ContractDrift[],
  requirements: Requirement[]
): Finding[] {
  const reqId = requirements[0]?.id ?? "REQ-001";
  const typeToBlocker: Record<string, string> = {
    "required-field-added": "undocumented-required-field",
    "field-removed": "schema-divergent",
    "field-renamed": "schema-divergent",
    "type-changed": "schema-divergent",
    "response-shape-changed": "schema-divergent",
    "status-semantics-changed": "business-error-inside-http-200",
    "auth-changed": "auth-divergent",
    "idempotency-broken": "missing-idempotency",
    "pagination-changed": "pagination-inconsistent",
    "endpoint-missing": "endpoint-not-found",
  };

  return drifts.map((d) => ({
    id: generateId("FND"),
    requirementId: reqId,
    severity:
      ["auth-changed", "required-field-added", "status-semantics-changed", "endpoint-missing"].includes(
        d.type
      )
        ? ("critical" as const)
        : ("major" as const),
    status: d.status === "verified" ? ("verified" as const) : ("unverified" as const),
    evidenceIds: d.evidenceIds,
    description: d.summary,
    blockerType: typeToBlocker[d.type] ?? d.type,
  }));
}
