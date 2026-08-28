/**
 * LangGraph entry point — orchestrates the IntegraGuard pipeline as a compiled graph.
 * Full multi-agent decomposition is reflected in trajectories; this graph wraps the checkpoint workflow.
 */
import { Annotation, StateGraph } from "@langchain/langgraph";
import type { AnalysisInput } from "@integraguard/schemas";
import {
  runIntegraGuardWorkflow,
  type WorkflowOptions,
  type WorkflowResult,
} from "./run-workflow.js";

const GraphState = Annotation.Root({
  input: Annotation<AnalysisInput>,
  autoApprove: Annotation<boolean>,
  useLlm: Annotation<boolean>,
  result: Annotation<WorkflowResult | undefined>,
});

export function buildIntegraGuardGraph() {
  const graph = new StateGraph(GraphState)
    .addNode("orchestrate", async (state) => {
      const result = await runIntegraGuardWorkflow(state.input, {
        autoApproveProbes: state.autoApprove,
        useLlm: state.useLlm,
      });
      return { result };
    })
    .addEdge("__start__", "orchestrate")
    .addEdge("orchestrate", "__end__");

  return graph.compile();
}

export async function runViaLangGraph(
  input: AnalysisInput,
  options: WorkflowOptions = {}
): Promise<WorkflowResult> {
  const app = buildIntegraGuardGraph();
  const out = await app.invoke({
    input,
    autoApprove: options.autoApproveProbes ?? true,
    useLlm: options.useLlm ?? input.useLlm ?? false,
    result: undefined,
  });
  if (out.result) return out.result;
  return runIntegraGuardWorkflow(input, options);
}

/** Nodes shown in UI workflow graph (matches agent trajectory agents) */
export const WORKFLOW_GRAPH_NODES = [
  "context-builder",
  "requirements-agent",
  "contract-mapper",
  "probe-planner",
  "sandbox-http-tools",
  "adversarial-verifier",
  "evidence-gate",
  "readiness-pack",
] as const;
