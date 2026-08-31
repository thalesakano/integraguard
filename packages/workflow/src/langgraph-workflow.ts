/**
 * Real LangGraph topology for contract-drift investigation.
 * Deterministic runner (`run-workflow.ts`) remains the default fallback for eval/demo stability.
 */
import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import { generateId } from "@integraguard/schemas";
import type { AnalysisInput, ProbePlan } from "@integraguard/schemas";
import {
  runDocsAnalystAgent,
  runProbeDesignerAgent,
  runResultAnalystAgent,
} from "@integraguard/agents";
import { httpProbe, evaluateProbePolicy, parseMarkdownDocs } from "@integraguard/tools";
import {
  createAgenticState,
  emitAgenticTrajectory,
  expectationsToRequirements,
  driftsToFindings,
  serializeAgenticCheckpoint,
  restoreAgenticStateFromCheckpoint,
  type AgenticState,
} from "./agentic-state.js";
import { promoteContractDrifts } from "./drift-evidence.js";
import {
  runEvidenceGate,
  buildReadinessPack,
  type WorkflowState,
} from "./evidence-gate.js";
import type { WorkflowOptions, WorkflowResult, SerializableWorkflowState } from "./run-workflow.js";
// runIntegraGuardWorkflow kept available via legacy module only

const GraphState = Annotation.Root({
  agentic: Annotation<AgenticState>,
});

function allowedHostsFor(input: AnalysisInput): string[] {
  if (input.allowedHosts && input.allowedHosts.length > 0) return input.allowedHosts;
  try {
    return [new URL(input.sandboxUrl).hostname];
  } catch {
    return ["localhost"];
  }
}

async function ingestContext(state: { agentic: AgenticState }) {
  const s = state.agentic;
  const sections = parseMarkdownDocs(s.input.documentation);
  emitAgenticTrajectory(s, "ingest_context", "index_documentation", {
    reason: `Indexed ${sections.length} documentation sections`,
    payload: { sectionCount: sections.length, label: "tool" },
  });
  for (const section of sections.slice(0, 3)) {
    s.evidences.push({
      id: generateId("EVD"),
      type: "document",
      sourceReference: section.reference,
      observation: `Section: ${section.title}`,
    });
  }
  s.route = "continue";
  return { agentic: s };
}

async function docsAnalyst(state: { agentic: AgenticState }) {
  const s = state.agentic;
  const { expectations, source } = await runDocsAnalystAgent({
    goal: s.input.goal,
    documentation: s.input.documentation,
    openApiSpec: s.input.openApiSpec,
    useLlm: s.useLlm,
  });
  s.expectations = expectations;
  s.requirements = expectationsToRequirements(expectations);
  s.mappings = expectations.slice(0, 5).map((e, i) => ({
    requirementId: s.requirements[Math.min(i, s.requirements.length - 1)]?.id ?? "REQ-001",
    endpoint: e.endpoint.path,
    method: e.endpoint.method,
    source: { file: "api-docs.md", section: e.source.section },
    confidence: e.confidence,
  }));
  emitAgenticTrajectory(s, "docs-analyst-agent", "extract_expectations", {
    instructionVersion: "v2",
    reason: `source=${source}`,
    payload: { count: expectations.length, label: "agent", source },
  });
  s.route = "continue";
  return { agentic: s };
}

async function probeDesigner(state: { agentic: AgenticState }) {
  const s = state.agentic;
  const remaining = Math.max(0, s.maxProbes - s.probesUsed);
  const previous = s.observations[s.observations.length - 1];
  const { plans, source } = await runProbeDesignerAgent({
    expectations: s.expectations,
    sampleRequest: s.input.sampleRequest,
    sandboxUrl: s.input.sandboxUrl,
    allowedHosts: allowedHostsFor(s.input),
    allowedOperations: s.input.allowedOperations ?? ["GET", "POST"],
    targetMode: s.input.targetMode,
    remainingBudget: remaining,
    useLlm: s.useLlm,
    previousObservation: previous
      ? {
          statusCode: previous.statusCode,
          body: previous.body,
          expectationId: previous.expectationId,
          probeId: previous.probeId,
        }
      : undefined,
  });

  // Deduplicate against already planned — include attempt/purpose so counterprobes survive
  const planKey = (p: { method: string; endpoint: string; purpose: string; attempt?: number }) =>
    `${p.method}:${p.endpoint}:${p.purpose}:${p.attempt ?? 1}`;
  const existing = new Set(s.probePlans.map(planKey));
  const fresh = plans.filter((p) => !existing.has(planKey(p)));
  s.probePlans.push(...fresh);
  s.probeQueue.push(...fresh);
  s.needsMoreProbes = false;
  emitAgenticTrajectory(s, "probe-designer-agent", "design_probes", {
    instructionVersion: "v2",
    reason: s.lastProbePurpose ? `counterprobe after: ${s.lastProbePurpose}` : undefined,
    payload: { count: fresh.length, label: "agent", source, loop: s.loopCount },
  });
  s.route = "continue";
  return { agentic: s };
}

async function riskRouter(state: { agentic: AgenticState }) {
  const s = state.agentic;
  if (s.probeQueue.length === 0) {
    s.route = "gate";
    return { agentic: s };
  }

  const next = s.probeQueue[0]!;
  const url = new URL(
    next.endpoint.replace(/^\//, ""),
    s.input.sandboxUrl.endsWith("/") ? s.input.sandboxUrl : s.input.sandboxUrl + "/"
  ).toString();
  const policy = evaluateProbePolicy({
    method: next.method,
    url,
    allowedHosts: allowedHostsFor(s.input),
    allowedOperations: s.input.allowedOperations ?? ["GET", "POST"],
    targetMode: s.input.targetMode,
    remainingBudget: s.maxProbes - s.probesUsed,
  });

  emitAgenticTrajectory(s, "risk-router", policy.action, {
    reason: policy.reason,
    payload: { probeId: next.id, label: "gate", risk: policy.risk },
  });

  if (policy.action === "block" || policy.action === "inconclusive") {
    s.probeQueue.shift();
    s.route = s.probeQueue.length ? "continue" : "gate";
    return { agentic: s };
  }

  if (policy.action === "require-approval" && !s.autoApprove && !s.approvedProbeIds.includes(next.id)) {
    next.requiresApproval = true;
    if (!s.pendingApprovals.some((p) => p.id === next.id)) {
      s.pendingApprovals.push(next);
    }
    s.status = "awaiting_approval";
    s.route = "approve";
    emitAgenticTrajectory(s, "human-gate", "await_human_approval", {
      toolCallId: next.id,
      reason: next.purpose,
      payload: { label: "human", ...next },
    });
    return { agentic: s };
  }

  s.route = "continue";
  return { agentic: s };
}

async function executeProbe(state: { agentic: AgenticState }) {
  const s = state.agentic;
  const plan = s.probeQueue.shift();
  if (!plan) {
    s.route = "gate";
    return { agentic: s };
  }

  const result = await httpProbe({
    probeId: plan.id,
    sandboxUrl: s.input.sandboxUrl,
    method: plan.method,
    endpoint: plan.endpoint,
    headers: { ...(s.executionHeaders ?? {}), ...plan.headers },
    body: plan.body,
  });
  s.probeResults.push(result);
  s.probesUsed += 1;

  // Prefer explicit plan.expectationId — never guess via purpose/category or expectations[0]
  const expectationId = plan.expectationId;
  if (!expectationId) {
    emitAgenticTrajectory(s, "sandbox-http-tools", "execute_probe", {
      toolCallId: plan.id,
      reason: "Missing expectationId on probe plan — observation not linked",
      payload: {
        label: "tool",
        statusCode: result.statusCode,
        endpoint: plan.endpoint,
        purpose: plan.purpose,
        unlinked: true,
      },
    });
    s.route = "continue";
    return { agentic: s };
  }

  const evId = generateId("EVD");
  s.evidences.push({
    id: evId,
    type: "http_probe",
    sourceReference: `probe:${result.probeId}`,
    observation: result.error ? `Probe failed: ${result.error}` : `HTTP ${result.statusCode}`,
    payload: result,
  });

  s.observations.push({
    probeId: plan.id,
    expectationId,
    statusCode: result.statusCode,
    body: result.body,
    error: result.error,
    durationMs: result.durationMs,
  });

  emitAgenticTrajectory(s, "sandbox-http-tools", "execute_probe", {
    toolCallId: plan.id,
    payload: {
      label: "tool",
      statusCode: result.statusCode,
      endpoint: plan.endpoint,
      purpose: plan.purpose,
      expectationId,
    },
  });

  s.route = "continue";
  return { agentic: s };
}

async function resultAnalyst(state: { agentic: AgenticState }) {
  const s = state.agentic;
  const obs = s.observations[s.observations.length - 1];
  if (!obs) {
    s.route = s.probeQueue.length ? "continue" : "gate";
    return { agentic: s };
  }

  const expectation = s.expectations.find((e) => e.id === obs.expectationId);
  if (!expectation) {
    s.route = s.probeQueue.length ? "continue" : "gate";
    return { agentic: s };
  }

  const { decision, source } = await runResultAnalystAgent({
    expectation,
    observation: obs,
    remainingBudget: s.maxProbes - s.probesUsed,
    useLlm: s.useLlm,
  });

  emitAgenticTrajectory(s, "result-analyst-agent", decision.kind, {
    instructionVersion: "v2",
    reason: decision.kind === "inconclusive" ? decision.reason : decision.kind === "match" ? decision.summary : decision.drift.summary,
    payload: { label: "agent", source, decision: decision.kind },
  });

  if (decision.kind === "mismatch") {
    const lastEv = s.evidences.filter((e) => e.type === "http_probe").at(-1);
    if (lastEv && !decision.drift.evidenceIds.includes(lastEv.id)) {
      decision.drift.evidenceIds = [...decision.drift.evidenceIds, lastEv.id];
    }
    s.driftCandidates.push(decision.drift);
  }

  if (
    decision.kind === "inconclusive" &&
    decision.needsAdditionalProbe &&
    s.loopCount < s.maxLoops &&
    s.probesUsed < s.maxProbes
  ) {
    s.needsMoreProbes = true;
    s.lastProbePurpose = decision.suggestedProbePurpose;
    s.loopCount += 1;
    s.route = "loop";
    return { agentic: s };
  }

  if (s.probeQueue.length > 0) {
    s.route = "continue";
  } else {
    s.route = "gate";
  }
  return { agentic: s };
}

async function evidenceGateNode(state: { agentic: AgenticState }) {
  const s = state.agentic;
  const promoted = promoteContractDrifts(s.driftCandidates, s.evidences);

  // Only type-specific verified drifts become verified findings.
  // Rejected drifts stay rejected — never re-fed to generic promotion.
  const verifiedFindings = driftsToFindings(promoted.verified, s.requirements).map((f) => ({
    ...f,
    status: "verified" as const,
  }));
  const rejectedFindings = driftsToFindings(promoted.rejected, s.requirements).map((f) => ({
    ...f,
    status: "rejected" as const,
  }));

  s.candidateFindings = [
    ...verifiedFindings,
    ...rejectedFindings,
    ...driftsToFindings(promoted.inconclusive, s.requirements).map((f) => ({
      ...f,
      status: "unverified" as const,
    })),
  ];
  s.verifiedFindings = verifiedFindings;

  for (const d of promoted.rejected) {
    emitAgenticTrajectory(s, "evidence-gate", "reject_drift", {
      reason: `Type-specific rejection: ${d.type}`,
      payload: { label: "gate", driftId: d.id, type: d.type, status: "rejected" },
    });
  }

  const requirements = s.requirements.length
    ? s.requirements
    : [{ id: "REQ-001", description: s.input.goal, severity: "critical" as const }];

  const gate = runEvidenceGate({
    findings: [...verifiedFindings, ...rejectedFindings],
    evidences: s.evidences,
    requirements,
  });

  emitAgenticTrajectory(s, "evidence-gate", "apply_gate_rules", {
    payload: {
      label: "gate",
      verified: gate.verifiedFindings.length,
      rejected: gate.rejectedFindings.length,
      decision: gate.decision,
      driftsVerified: promoted.verified.length,
      driftsRejected: promoted.rejected.length,
    },
  });

  const pack = buildReadinessPack(
    s.runId,
    gate,
    requirements,
    s.mappings,
    s.evidences,
    s.candidateFindings
  );

  s.pack = pack;
  s.verifiedFindings = gate.verifiedFindings;
  s.status = "completed";
  s.route = "end";
  return { agentic: s };
}

function routeAfterRisk(state: { agentic: AgenticState }): string {
  if (state.agentic.route === "approve") return "human_approval";
  if (state.agentic.route === "gate") return "evidence_gate";
  return "execute_probe";
}

function routeAfterResult(state: { agentic: AgenticState }): string {
  if (state.agentic.route === "loop") return "probe_designer";
  if (state.agentic.route === "gate") return "evidence_gate";
  return "risk_router";
}

export function buildAgenticContractGraph() {
  const graph = new StateGraph(GraphState)
    .addNode("ingest_context", ingestContext)
    .addNode("docs_analyst", docsAnalyst)
    .addNode("probe_designer", probeDesigner)
    .addNode("risk_router", riskRouter)
    .addNode("execute_probe", executeProbe)
    .addNode("result_analyst", resultAnalyst)
    .addNode("evidence_gate", evidenceGateNode)
    .addNode("human_approval", async (state) => state) // pause handled by runner
    .addEdge(START, "ingest_context")
    .addEdge("ingest_context", "docs_analyst")
    .addEdge("docs_analyst", "probe_designer")
    .addEdge("probe_designer", "risk_router")
    .addConditionalEdges("risk_router", routeAfterRisk, {
      human_approval: "human_approval",
      execute_probe: "execute_probe",
      evidence_gate: "evidence_gate",
    })
    .addEdge("execute_probe", "result_analyst")
    .addConditionalEdges("result_analyst", routeAfterResult, {
      probe_designer: "probe_designer",
      risk_router: "risk_router",
      evidence_gate: "evidence_gate",
    })
    .addEdge("human_approval", END)
    .addEdge("evidence_gate", END);

  return graph.compile();
}

function agenticToWorkflowResult(s: AgenticState): WorkflowResult {
  const pack = s.pack;
  const agentic = serializeAgenticCheckpoint(s);
  const checkpoint: SerializableWorkflowState = {
    runId: s.runId,
    input: s.input,
    phase: s.status === "awaiting_approval" ? "probes" : s.status === "completed" ? "complete" : "probes",
    probeIndex: s.probesUsed,
    requirements: s.requirements,
    mappings: s.mappings,
    probePlans: s.probePlans,
    probeResults: s.probeResults,
    probePurposes: Object.fromEntries(s.probePlans.map((p) => [p.id, p.purpose])),
    evidences: s.evidences,
    candidateFindings: s.candidateFindings,
    verifiedFindings: s.verifiedFindings,
    trajectories: s.trajectories,
    retries: {},
    pendingApprovals: s.pendingApprovals,
    approvedProbeIds: s.approvedProbeIds,
    verifyRetryCount: s.loopCount,
    status: s.status,
    pack,
    agentic,
  };

  const state: WorkflowState = {
    ...checkpoint,
    approvedProbeIds: new Set(s.approvedProbeIds),
  };

  return {
    pack,
    trajectories: s.trajectories,
    state,
    paused: s.status === "awaiting_approval",
    checkpoint,
  };
}

export async function runAgenticContractWorkflow(
  input: AnalysisInput,
  options: WorkflowOptions = {}
): Promise<WorkflowResult> {
  const initial = createAgenticState(input, {
    useLlm: options.useLlm ?? input.useLlm,
    autoApprove: options.autoApproveProbes ?? true,
    maxProbes: input.maxProbes,
    executionHeaders: options.executionHeaders,
  });

  const app = buildAgenticContractGraph();
  const out = await app.invoke({ agentic: initial });
  const result = agenticToWorkflowResult(out.agentic);
  for (const ev of result.trajectories) options.onEvent?.(ev);
  return result;
}

/** Resume agentic run after human approval of a probe id — restores FULL checkpoint state. */
export async function approveAgenticProbeAndContinue(
  checkpoint: SerializableWorkflowState,
  probeId: string,
  options: WorkflowOptions = {}
): Promise<WorkflowResult> {
  if (!checkpoint.agentic) {
    throw new Error(
      "Agentic checkpoint missing — cannot resume without full agentic state (expectations, observations, drifts)"
    );
  }

  // Simulate process restart: JSON roundtrip is applied by callers; still re-parse here.
  const s = restoreAgenticStateFromCheckpoint(
    JSON.parse(JSON.stringify(checkpoint.agentic)),
    {
      executionHeaders: options.executionHeaders,
      autoApprove: options.autoApproveProbes ?? false,
      useLlm: options.useLlm ?? checkpoint.agentic.useLlm,
    }
  );

  if (!s.approvedProbeIds.includes(probeId)) {
    s.approvedProbeIds = [...s.approvedProbeIds, probeId];
  }
  s.pendingApprovals = s.pendingApprovals.filter((p) => p.id !== probeId);
  s.status = "running";
  s.route = "continue";
  s.autoApprove = options.autoApproveProbes ?? false;

  // Continue from risk router using restored queues/observations/drifts (no reconstruction).
  const app = buildAgenticContractGraph();
  while (s.status === "running") {
    await riskRouter({ agentic: s });
    // riskRouter mutates route — re-read as full union (CFA narrows after assignment above).
    const afterRisk = s.route as AgenticState["route"];
    if (afterRisk === "approve") break;
    if (afterRisk === "gate") {
      await evidenceGateNode({ agentic: s });
      break;
    }
    await executeProbe({ agentic: s });
    await resultAnalyst({ agentic: s });
    const afterResult = s.route as AgenticState["route"];
    if (afterResult === "loop") {
      await probeDesigner({ agentic: s });
      continue;
    }
    if (afterResult === "gate") {
      await evidenceGateNode({ agentic: s });
      break;
    }
  }

  void app;
  const result = agenticToWorkflowResult(s);
  for (const ev of result.trajectories) options.onEvent?.(ev);
  return result;
}

export async function runViaLangGraph(
  input: AnalysisInput,
  options: WorkflowOptions & { agentic?: boolean } = {}
): Promise<WorkflowResult> {
  // LangGraph path uses real multi-node agentic topology by default.
  // Set INTEGRAGUARD_AGENTIC=0 to force legacy single-node wrapper.
  const agentic =
    options.agentic ??
    (process.env.INTEGRAGUARD_AGENTIC === "0" ? false : true);
  if (agentic) {
    return runAgenticContractWorkflow(input, options);
  }
  const { runLegacyLangGraph } = await import("./langgraph-legacy.js");
  return runLegacyLangGraph(input, options);
}

export const WORKFLOW_GRAPH_NODES = [
  "ingest_context",
  "docs-analyst-agent",
  "probe-designer-agent",
  "risk-router",
  "sandbox-http-tools",
  "result-analyst-agent",
  "evidence-gate",
  "human-gate",
] as const;

export { buildIntegraGuardGraph } from "./langgraph-legacy.js";
