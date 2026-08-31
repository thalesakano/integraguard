"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { RunModeBadge } from "@/app/components/RunModeBadge";
import { ContractDiffPanel } from "@/app/components/ContractDiffPanel";
import {
  InvestigationActions,
  buildMinimalReproduction,
  buildVendorQuestion,
} from "@/app/components/InvestigationActions";

const GRAPH_NODES = [
  "ingest_context",
  "docs-analyst-agent",
  "probe-designer-agent",
  "risk-router",
  "sandbox-http-tools",
  "result-analyst-agent",
  "evidence-gate",
  "readiness-pack",
];

interface ProbePlan {
  id: string;
  method: string;
  endpoint: string;
  purpose: string;
  sideEffectRisk: string;
}

interface TrajectoryEvent {
  agent: string;
  action: string;
  reason?: string;
  timestamp: string;
  retry?: number;
  toolCallId?: string;
  payload?: { label?: string };
}

interface RunData {
  id: string;
  status: string;
  trajectories: TrajectoryEvent[];
  input?: { sandboxUrl?: string; sampleRequest?: unknown };
  pack?: {
    decision: string;
    readinessScore: number;
    findings: {
      id: string;
      severity: string;
      status: string;
      description: string;
      evidenceIds: string[];
      blockerType?: string;
    }[];
    mappings?: { method: string; endpoint: string; requirementId: string }[];
    unansweredQuestions?: string[];
  };
  pendingProbeIds: string[];
  pendingProbes: ProbePlan[];
  useLangGraph?: boolean;
}

function badgeForAgent(agent: string): "agent" | "tool" | "human" | "gate" | "deterministic" {
  if (agent.includes("human") || agent === "human-gate") return "human";
  if (agent.includes("gate") || agent === "risk-router") return "gate";
  if (agent.includes("http") || agent.includes("tool") || agent === "ingest_context") return "tool";
  if (agent.includes("analyst") || agent.includes("designer") || agent.includes("agent")) return "agent";
  return "deterministic";
}

function WorkflowGraph({ trajectories, status }: { trajectories: TrajectoryEvent[]; status: string }) {
  const completedAgents = new Set(trajectories.map((t) => t.agent));
  const lastAgent = trajectories[trajectories.length - 1]?.agent;
  const nextProbeReason = [...trajectories]
    .reverse()
    .find((t) => t.agent === "result-analyst-agent" && t.reason)?.reason;

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium">Agent Workflow Graph</h3>
        <div className="flex gap-1">
          <RunModeBadge kind="agent" />
          <RunModeBadge kind="tool" />
          <RunModeBadge kind="human" />
          <RunModeBadge kind="gate" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {GRAPH_NODES.map((node, i) => {
          const done =
            completedAgents.has(node) ||
            (node === "readiness-pack" && status === "completed") ||
            (node === "sandbox-http-tools" && completedAgents.has("sandbox-http-tools"));
          const active = lastAgent === node;
          return (
            <div key={node} className="flex items-center gap-2">
              {i > 0 && <span className="text-[var(--muted)]">→</span>}
              <div
                className={`px-3 py-2 rounded-lg border ${
                  active && status !== "completed"
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : done
                      ? "border-[var(--success)]/50 bg-[var(--success)]/5"
                      : "border-[var(--border)] opacity-50"
                }`}
              >
                {node}
              </div>
            </div>
          );
        })}
      </div>
      {nextProbeReason && status !== "completed" && (
        <p className="text-xs text-[var(--muted)] mt-3">Next probe reason: {nextProbeReason}</p>
      )}
    </div>
  );
}

export default function RunPage() {
  const params = useParams();
  const id = params.id as string;
  const [run, setRun] = useState<RunData | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/analyses/${id}`);
    return res.json() as Promise<RunData>;
  }, [id]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      const data = await refresh();
      if (!active) return;
      setRun(data);
      if (data.status === "running" || data.status === "awaiting_approval") {
        timer = setTimeout(poll, 1500);
      }
    }
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, refresh]);

  async function approveProbe(probeId: string) {
    setApproving(probeId);
    try {
      await fetch(`/api/analyses/${id}/approve-probe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ probeId }),
      });
      setRun(await refresh());
    } finally {
      setApproving(null);
    }
  }

  if (!run) return <p className="text-[var(--muted)]">Loading workflow...</p>;

  const verified = run.pack?.findings.filter((f) => f.status === "verified") ?? [];
  const baseUrl = run.input?.sandboxUrl ?? "";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold">Live Workflow</h2>
          <p className="text-sm text-[var(--muted)]">Run {id}</p>
          {run.useLangGraph && (
            <div className="mt-1">
              <RunModeBadge kind="agent" />
            </div>
          )}
        </div>
        {run.status === "completed" && (
          <Link href={`/runs/${id}/pack`} className="bg-[var(--accent)] text-white px-4 py-2 rounded-lg text-sm">
            View Readiness Pack →
          </Link>
        )}
      </div>

      <WorkflowGraph trajectories={run.trajectories} status={run.status} />

      {run.status === "awaiting_approval" && run.pendingProbes.length > 0 && (
        <div className="card mb-6 border-[var(--warning)]">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-medium text-[var(--warning)]">Human Approval Required</h3>
            <RunModeBadge kind="human" />
          </div>
          <p className="text-sm text-[var(--muted)] mb-3">
            Mutating probes paused until you approve side-effect HTTP calls.
          </p>
          {run.pendingProbes.map((probe) => (
            <div key={probe.id} className="flex items-center justify-between bg-[var(--bg)] p-3 rounded-lg mb-2 text-sm">
              <div>
                <p className="font-mono">{probe.method} {probe.endpoint}</p>
                <p className="text-[var(--muted)] text-xs">{probe.purpose}</p>
                <p className="text-xs">Risk: {probe.sideEffectRisk}</p>
              </div>
              <button
                onClick={() => approveProbe(probe.id)}
                disabled={approving === probe.id}
                className="bg-[var(--accent)] text-white px-4 py-1 rounded-lg text-sm disabled:opacity-50"
              >
                {approving === probe.id ? "Approving..." : "Approve probe"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <h3 className="font-medium mb-4">Agent Timeline</h3>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {run.trajectories.map((ev, i) => (
              <div key={i} className="border-l-2 border-[var(--accent)] pl-4 py-1">
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <RunModeBadge kind={badgeForAgent(ev.agent)} />
                  <span className="font-mono text-[var(--accent)]">{ev.agent}</span>
                  <span className="text-[var(--muted)]">→</span>
                  <span>{ev.action}</span>
                  {ev.retry ? <span className="text-xs text-[var(--warning)]">retry {ev.retry}</span> : null}
                </div>
                {ev.reason && <p className="text-xs text-[var(--muted)] mt-1">{ev.reason}</p>}
                <p className="text-xs text-[var(--muted)]">{new Date(ev.timestamp).toLocaleTimeString()}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="font-medium mb-2">Status</h3>
            <p className={`text-lg font-bold status-${run.pack?.decision ?? "CONDITIONAL"}`}>
              {run.status === "completed" ? run.pack?.decision : run.status.replace("_", " ").toUpperCase()}
            </p>
            {run.pack && <p className="text-sm text-[var(--muted)]">Score: {run.pack.readinessScore}/100</p>}
          </div>

          {verified.length > 0 && (
            <div className="card">
              <h3 className="font-medium mb-2">Verified Findings</h3>
              {verified.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFinding(f.id)}
                  className={`block w-full text-left text-sm p-2 rounded mb-1 ${selectedFinding === f.id ? "bg-[var(--bg)]" : "hover:bg-[var(--bg)]"}`}
                >
                  <span className={`text-xs uppercase ${f.severity === "critical" ? "text-[var(--danger)]" : "text-[var(--warning)]"}`}>{f.severity}</span>
                  <p className="mt-1">{f.description.slice(0, 80)}...</p>
                </button>
              ))}
            </div>
          )}

          {(run.pack?.unansweredQuestions?.length ?? 0) > 0 && (
            <div className="card">
              <h3 className="font-medium mb-2">Validation gaps</h3>
              <ul className="text-xs text-[var(--muted)] space-y-1">
                {run.pack!.unansweredQuestions!.slice(0, 5).map((q, i) => (
                  <li key={i}>• {q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {selectedFinding && (
        <div className="card mt-6 space-y-4">
          <h3 className="font-medium">Investigation — {selectedFinding}</h3>
          {(() => {
            const f = verified.find((x) => x.id === selectedFinding);
            if (!f) return null;
            const mapping = run.pack?.mappings?.[0];
            return (
              <>
                <ContractDiffPanel
                  status="DRIFT"
                  documented={{
                    label: "Documented",
                    fields: [{ name: "Expectation", detail: f.description.slice(0, 100), tone: "removed" }],
                  }}
                  observed={{
                    label: "Observed",
                    fields: [{ name: f.blockerType ?? f.severity, tone: "added" }],
                  }}
                  actions={
                    <InvestigationActions
                      reproduction={buildMinimalReproduction({
                        method: mapping?.method ?? "POST",
                        endpoint: mapping?.endpoint ?? "/",
                        baseUrl,
                        body: run.input?.sampleRequest,
                        finding: f.description,
                      })}
                      vendorQuestion={buildVendorQuestion({
                        finding: f.description,
                        blockerType: f.blockerType,
                        method: mapping?.method,
                        endpoint: mapping?.endpoint,
                      })}
                    />
                  }
                />
                <EvidenceChain runId={id} findingId={selectedFinding} />
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function EvidenceChain({ runId, findingId }: { runId: string; findingId: string }) {
  const [chain, setChain] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    fetch(`/api/analyses/${runId}/evidence-chain?findingId=${findingId}`)
      .then((r) => r.json())
      .then(setChain);
  }, [runId, findingId]);

  if (!chain) return <p className="text-sm text-[var(--muted)]">Loading chain...</p>;

  const steps = [
    ["Requirement", chain.requirement],
    ["Doc Source", chain.docSource],
    ["Hypothesis", chain.hypothesis],
    ["HTTP Request", chain.httpRequest],
    ["HTTP Response", chain.httpResponse],
    ["Verifier", chain.verifier],
    ["Generated Test", chain.test],
  ];

  return (
    <div>
      <div className="flex gap-1 mb-2">
        <RunModeBadge kind="tool" />
        <RunModeBadge kind="gate" />
      </div>
      <div className="flex flex-wrap gap-2 items-center text-sm">
        {steps.map(([label, value], i) => (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && <span className="text-[var(--muted)]">↓</span>}
            <div className="bg-[var(--bg)] px-3 py-2 rounded-lg">
              <p className="text-xs text-[var(--muted)]">{label}</p>
              <p className="font-mono text-xs max-w-[200px] truncate">{value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
