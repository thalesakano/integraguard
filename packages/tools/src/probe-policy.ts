export type ProbeRiskLevel = "safe" | "mutating" | "unknown";

export type ProbePolicyDecision =
  | { action: "auto-execute"; reason: string; risk: ProbeRiskLevel }
  | { action: "require-approval"; reason: string; risk: ProbeRiskLevel }
  | { action: "block"; reason: string; risk: ProbeRiskLevel }
  | { action: "inconclusive"; reason: string; risk: ProbeRiskLevel };

export interface ProbePolicyInput {
  method: string;
  url: string;
  allowedHosts: string[];
  allowedOperations: string[];
  targetMode?: "sandbox" | "custom" | "real-api" | "docs-url";
  remainingBudget: number;
  autoApproveMethods?: string[];
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function classifyProbeRisk(method: string): ProbeRiskLevel {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return "safe";
  if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) return "mutating";
  return "unknown";
}

/**
 * Deterministic authorization of a proposed probe — never uses LLM.
 */
export function evaluateProbePolicy(input: ProbePolicyInput): ProbePolicyDecision {
  const method = input.method.toUpperCase();
  const risk = classifyProbeRisk(method);
  const autoApprove = (input.autoApproveMethods ?? ["GET", "HEAD", "OPTIONS"]).map((m) =>
    m.toUpperCase()
  );

  if (input.remainingBudget <= 0) {
    return {
      action: "inconclusive",
      reason: "Probe budget exhausted",
      risk,
    };
  }

  if (!input.allowedOperations.map((m) => m.toUpperCase()).includes(method)) {
    return {
      action: "block",
      reason: `Method ${method} is not in allowedOperations`,
      risk,
    };
  }

  const host = hostOf(input.url);
  if (!host) {
    return { action: "block", reason: "Invalid probe URL", risk };
  }

  const allowed = input.allowedHosts.map((h) => h.toLowerCase());
  // Fail-closed: empty allowlist never inherits the caller target.
  if (allowed.length === 0) {
    return {
      action: "block",
      reason: "allowedHosts is empty — fail-closed (configure explicit hosts)",
      risk,
    };
  }
  if (!allowed.includes(host) && !allowed.includes("*")) {
    return {
      action: "block",
      reason: `Host ${host} is outside allowedHosts`,
      risk,
    };
  }

  // Real-API mutating probes always require approval — never silent auto-execute.
  if (input.targetMode === "real-api" && risk === "mutating") {
    return {
      action: "require-approval",
      reason: "Mutating method against real API requires human approval",
      risk,
    };
  }

  if (risk === "safe" && autoApprove.includes(method)) {
    return {
      action: "auto-execute",
      reason: `${method} is read-only and auto-approved`,
      risk,
    };
  }

  if (risk === "mutating" || risk === "unknown") {
    return {
      action: "require-approval",
      reason: `${method} may cause side effects`,
      risk,
    };
  }

  return {
    action: "auto-execute",
    reason: `${method} permitted`,
    risk,
  };
}
