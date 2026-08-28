import type { Requirement } from "@integraguard/schemas";
import { parseMarkdownDocs, parseOpenApi } from "@integraguard/tools";
import { isLlmAvailable, suggestRequirementsWithLlm } from "./llm-client.js";

export const INSTRUCTION_VERSION = "v1";

export interface RequirementsAgentInput {
  goal: string;
  documentation: string;
  openApiSpec?: string;
  useLlm?: boolean;
}

export function runRequirementsAgentDeterministic(input: RequirementsAgentInput): Requirement[] {
  const requirements: Requirement[] = [
    { id: "REQ-001", description: "Submit integration request per documented contract", severity: "critical" },
    { id: "REQ-002", description: "Handle and interpret API responses correctly", severity: "critical" },
    { id: "REQ-003", description: "Query status or follow-up operations if documented", severity: "major" },
  ];

  const sections = parseMarkdownDocs(input.documentation);
  const hasIdempotency = sections.some((s) => /idempoten/i.test(s.content)) || /idempoten/i.test(input.documentation);
  if (hasIdempotency) {
    requirements.push({
      id: "REQ-004",
      description: "Prevent duplicate submissions via idempotency",
      severity: "major",
    });
  }

  const hasAuth = sections.some((s) => /auth|bearer|api.key|x-api-key/i.test(s.content));
  if (hasAuth || input.openApiSpec) {
    requirements.push({
      id: "REQ-005",
      description: "Authenticate requests per documented method",
      severity: "critical",
    });
  }

  if (/paginat|totalpages|\?page=|cursor/i.test(input.documentation)) {
    requirements.push({
      id: "REQ-007",
      description: "List resources with documented pagination contract",
      severity: "major",
    });
  }

  if (input.openApiSpec) {
    const api = parseOpenApi(input.openApiSpec);
    for (const ep of api.endpoints) {
      if (ep.method === "GET" && ep.path.includes("status")) {
        requirements.push({
          id: "REQ-006",
          description: `Query status via ${ep.method} ${ep.path}`,
          severity: "major",
        });
      }
    }
  }

  return requirements;
}

/** Deterministic extraction; optionally enriched by LLM when OPENAI_API_KEY is set. */
export async function runRequirementsAgent(input: RequirementsAgentInput): Promise<Requirement[]> {
  const base = runRequirementsAgentDeterministic(input);
  if (!input.useLlm || !isLlmAvailable()) return base;
  return suggestRequirementsWithLlm({
    goal: input.goal,
    documentation: input.documentation,
    existing: base,
  });
}

/** @deprecated alias for deterministic path in tests/eval */
export const runRequirementsAgentSync = runRequirementsAgentDeterministic;