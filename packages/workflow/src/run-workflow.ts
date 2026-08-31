import { generateId } from "@integraguard/schemas";
import type {
  AnalysisInput,
  ReadinessPack,
  TrajectoryEvent,
  ProbePlan,
  AgenticCheckpoint,
} from "@integraguard/schemas";
import {
  runRequirementsAgent,
  runContractMapper,
  runProbePlanner,
  runAdversarialVerifier,
  analyzeProbeResults,
  INSTRUCTION_VERSION,
} from "@integraguard/agents";
import { httpProbe, parseMarkdownDocs } from "@integraguard/tools";
import {
  runEvidenceGate,
  buildReadinessPack,
  emitTrajectory,
  type WorkflowState,
} from "./evidence-gate.js";

export type WorkflowPhase =
  | "init"
  | "probes"
  | "verify"
  | "complete";

export interface SerializableWorkflowState {
  runId: string;
  input: AnalysisInput;
  phase: WorkflowPhase;
  probeIndex: number;
  requirements: WorkflowState["requirements"];
  mappings: WorkflowState["mappings"];
  probePlans: ProbePlan[];
  probeResults: WorkflowState["probeResults"];
  probePurposes: Record<string, string>;
  evidences: WorkflowState["evidences"];
  candidateFindings: WorkflowState["candidateFindings"];
  verifiedFindings: WorkflowState["verifiedFindings"];
  trajectories: TrajectoryEvent[];
  retries: Record<string, number>;
  pendingApprovals: ProbePlan[];
  approvedProbeIds: string[];
  verifyRetryCount: number;
  status: WorkflowState["status"];
  pack?: ReadinessPack;
  /** Full agentic state when the run used the LangGraph contract workflow. */
  agentic?: AgenticCheckpoint;
}

export interface WorkflowOptions {
  autoApproveProbes?: boolean;
  useLlm?: boolean;
  onEvent?: (event: TrajectoryEvent) => void;
  /** Non-serializable execution credentials — never copy onto AnalysisInput / checkpoints. */
  executionHeaders?: Record<string, string>;
}

export interface WorkflowResult {
  pack?: ReadinessPack;
  trajectories: TrajectoryEvent[];
  state: WorkflowState;
  paused: boolean;
  checkpoint: SerializableWorkflowState;
}

function toWorkflowState(s: SerializableWorkflowState): WorkflowState {
  return {
    ...s,
    approvedProbeIds: new Set(s.approvedProbeIds),
  };
}

export function serializeWorkflowState(state: WorkflowState, extra?: Partial<SerializableWorkflowState>): SerializableWorkflowState {
  return {
    runId: state.runId,
    input: state.input,
    phase: extra?.phase ?? "init",
    probeIndex: extra?.probeIndex ?? 0,
    requirements: state.requirements,
    mappings: state.mappings,
    probePlans: state.probePlans,
    probeResults: state.probeResults,
    probePurposes: extra?.probePurposes ?? {},
    evidences: state.evidences,
    candidateFindings: state.candidateFindings,
    verifiedFindings: state.verifiedFindings,
    trajectories: state.trajectories,
    retries: state.retries,
    pendingApprovals: state.pendingApprovals,
    approvedProbeIds: [...state.approvedProbeIds],
    verifyRetryCount: extra?.verifyRetryCount ?? 0,
    status: state.status,
    pack: state.pack,
  };
}

function createInitialSerializable(input: AnalysisInput, runId?: string): SerializableWorkflowState {
  return {
    runId: runId ?? generateId("run"),
    input,
    phase: "init",
    probeIndex: 0,
    requirements: [],
    mappings: [],
    probePlans: [],
    probeResults: [],
    probePurposes: {},
    evidences: [],
    candidateFindings: [],
    verifiedFindings: [],
    trajectories: [],
    retries: {},
    pendingApprovals: [],
    approvedProbeIds: [],
    verifyRetryCount: 0,
    status: "running",
  };
}

export async function runIntegraGuardWorkflow(
  input: AnalysisInput,
  options: WorkflowOptions = {}
): Promise<WorkflowResult> {
  const serial = createInitialSerializable(input);
  return runWorkflowFromCheckpoint(serial, options);
}

export async function runWorkflowFromCheckpoint(
  serial: SerializableWorkflowState,
  options: WorkflowOptions = {}
): Promise<WorkflowResult> {
  const autoApprove = options.autoApproveProbes ?? true;
  const executionHeaders = options.executionHeaders ?? {};
  const state = toWorkflowState(serial);
  const probePurposes = serial.probePurposes;

  const emit = (agent: string, action: string, extra?: Partial<TrajectoryEvent>) => {
    const ev = emitTrajectory(state, agent, action, extra);
    options.onEvent?.(ev);
    return ev;
  };

  // Phase: init — context, requirements, mapping, planning
  if (serial.phase === "init") {
    const sections = parseMarkdownDocs(state.input.documentation);
    emit("context-builder", "index_documentation", {
      reason: `Indexed ${sections.length} documentation sections`,
      payload: { sectionCount: sections.length },
    });

    for (const section of sections.slice(0, 3)) {
      state.evidences.push({
        id: generateId("EVD"),
        type: "document",
        sourceReference: section.reference,
        observation: `Section: ${section.title}`,
      });
    }

    state.requirements = await runRequirementsAgent({
      goal: state.input.goal,
      documentation: state.input.documentation,
      openApiSpec: state.input.openApiSpec,
      useLlm: options.useLlm ?? state.input.useLlm,
    });
    emit("requirements-agent", "extract_requirements", {
      instructionVersion: INSTRUCTION_VERSION,
      payload: {
        count: state.requirements.length,
        llm: Boolean(options.useLlm ?? state.input.useLlm),
      },
    });

    state.mappings = runContractMapper({
      requirements: state.requirements,
      documentation: state.input.documentation,
      openApiSpec: state.input.openApiSpec,
    });
    emit("contract-mapper", "map_requirements_to_endpoints", {
      instructionVersion: INSTRUCTION_VERSION,
      payload: { mappings: state.mappings.length },
    });

    state.probePlans = runProbePlanner({
      mappings: state.mappings,
      sampleRequest: state.input.sampleRequest,
      documentation: state.input.documentation,
    });
    for (const plan of state.probePlans) {
      probePurposes[plan.id] = plan.purpose;
    }
    emit("probe-planner", "plan_probes", {
      instructionVersion: INSTRUCTION_VERSION,
      payload: { probeCount: state.probePlans.length },
    });

    serial.phase = "probes";
    serial.probeIndex = 0;
  }

  // Phase: probes — execute HTTP probes (may pause for human approval)
  if (serial.phase === "probes") {
    for (let i = serial.probeIndex; i < state.probePlans.length; i++) {
      const plan = state.probePlans[i]!;

      if (plan.requiresApproval && !autoApprove && !state.approvedProbeIds.has(plan.id)) {
        if (!state.pendingApprovals.some((p) => p.id === plan.id)) {
          state.pendingApprovals.push(plan);
        }
        state.status = "awaiting_approval";
        emit("probe-planner", "await_human_approval", {
          toolCallId: plan.id,
          reason: plan.purpose,
          payload: plan,
        });
        serial.probeIndex = i;
        serial.phase = "probes";
        return buildResult(state, serial, probePurposes, true);
      }

      const result = await httpProbe({
        probeId: plan.id,
        sandboxUrl: state.input.sandboxUrl,
        method: plan.method,
        endpoint: plan.endpoint,
        headers: { ...executionHeaders, ...plan.headers },
        body: plan.body,
      });
      state.probeResults.push(result);
      emit("sandbox-http-tools", "execute_probe", {
        toolCallId: plan.id,
        payload: { statusCode: result.statusCode, endpoint: plan.endpoint, purpose: plan.purpose },
      });
      serial.probeIndex = i + 1;
    }
    serial.phase = "verify";
  }

  // Phase: verify — analyze, adversarial verifier, evidence gate
  if (serial.phase === "verify") {
    const probeMeta = Object.fromEntries(
      state.probePlans.map((p) => [p.id, { method: p.method, endpoint: p.endpoint }])
    );
    const analysis = analyzeProbeResults(
      state.probeResults,
      state.input.documentation,
      state.requirements,
      probePurposes,
      probeMeta
    );
    state.evidences.push(...analysis.evidences);
    state.candidateFindings = analysis.findings;

    emit("adversarial-verifier", "analyze_probe_results", {
      payload: { candidateFindings: state.candidateFindings.length },
    });

    let verified = state.verifiedFindings;
    const maxRetries = 2;

    while (serial.verifyRetryCount <= maxRetries) {
      const verifierResult = runAdversarialVerifier({
        candidateFindings: state.candidateFindings,
        evidences: state.evidences,
        probeResults: state.probeResults,
        documentation: state.input.documentation,
      });

      for (const d of verifierResult.decisions) {
        emit("adversarial-verifier", d.action, {
          reason: d.reason,
          retry: serial.verifyRetryCount,
          payload: { findingId: d.findingId },
        });
      }

      verified = verifierResult.findings;

      if (verifierResult.additionalProbes.length === 0 || serial.verifyRetryCount >= maxRetries) break;

      for (const findingId of verifierResult.additionalProbes) {
        const finding = state.candidateFindings.find((f) => f.id === findingId);
        if (!finding) continue;
        const mapping = state.mappings.find((m) => m.requirementId === finding.requirementId);
        if (!mapping) continue;

        const probeId = generateId("probe-retry");
        probePurposes[probeId] = "retry verification probe";
        const result = await httpProbe({
          probeId,
          sandboxUrl: state.input.sandboxUrl,
          method: mapping.method,
          endpoint: mapping.endpoint,
          body: state.input.sampleRequest ?? {},
          headers: {
            ...executionHeaders,
            "X-Provider-Id": "PROV-001",
            "X-API-Key": executionHeaders["X-API-Key"] ?? "test-key",
          },
        });
        state.probeResults.push(result);
        const evId = generateId("EVD");
        state.evidences.push({
          id: evId,
          type: "http_probe",
          sourceReference: `retry-probe:${result.probeId}`,
          observation: `Retry probe HTTP ${result.statusCode}`,
          payload: result,
        });
        finding.evidenceIds.push(evId);
      }
      serial.verifyRetryCount++;
    }

    state.verifiedFindings = verified;

    const gate = runEvidenceGate({
      findings: state.verifiedFindings.length > 0 ? state.verifiedFindings : state.candidateFindings,
      evidences: state.evidences,
      requirements: state.requirements,
    });

    emit("evidence-gate", "apply_gate_rules", {
      payload: {
        verified: gate.verifiedFindings.length,
        rejected: gate.rejectedFindings.length,
        decision: gate.decision,
      },
    });

    state.pack = buildReadinessPack(
      state.runId,
      gate,
      state.requirements,
      state.mappings,
      state.evidences,
      state.candidateFindings
    );
    state.status = "completed";
    serial.phase = "complete";
  }

  return buildResult(state, serial, probePurposes, false);
}

function buildResult(
  state: WorkflowState,
  serial: SerializableWorkflowState,
  probePurposes: Record<string, string>,
  paused: boolean
): WorkflowResult {
  serial.probePurposes = probePurposes;
  Object.assign(serial, {
    requirements: state.requirements,
    mappings: state.mappings,
    probePlans: state.probePlans,
    probeResults: state.probeResults,
    evidences: state.evidences,
    candidateFindings: state.candidateFindings,
    verifiedFindings: state.verifiedFindings,
    trajectories: state.trajectories,
    pendingApprovals: state.pendingApprovals,
    approvedProbeIds: [...state.approvedProbeIds],
    status: state.status,
    pack: state.pack,
  });

  return {
    pack: state.pack,
    trajectories: state.trajectories,
    state: toWorkflowState(serial),
    paused,
    checkpoint: serial,
  };
}

export async function approveProbeAndContinue(
  serial: SerializableWorkflowState,
  probeId: string,
  options: WorkflowOptions = {}
): Promise<WorkflowResult> {
  if (!serial.approvedProbeIds.includes(probeId)) {
    serial.approvedProbeIds.push(probeId);
  }
  serial.pendingApprovals = serial.pendingApprovals.filter((p) => p.id !== probeId);
  serial.status = "running";
  return runWorkflowFromCheckpoint(serial, options);
}

export { runEvidenceGate, buildReadinessPack } from "./evidence-gate.js";
export type { WorkflowState, EvidenceGateResult } from "./evidence-gate.js";
