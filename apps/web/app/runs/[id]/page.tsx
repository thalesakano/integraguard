"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const GRAPH_NODES = [
  "context-builder",
  "requirements-agent",
  "contract-mapper",
  "probe-planner",
  "sandbox-http-tools",
  "adversarial-verifier",
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
}

interface RunData {
  id: string;
  status: string;
  trajectories: TrajectoryEvent[];
  pack?: {
    decision: string;
    readinessScore: number;
    findings: { id: string; severity: string; status: string; description: string; evidenceIds: string[] }[];
  };
  pendingProbeIds: string[];
  pendingProbes: ProbePlan[];
}

function WorkflowGraph({ trajectories, status }: { trajectories: TrajectoryEvent[]; status: string }) {
  const completedAgents = new Set(trajectories.map((t) => t.agent));
  const lastAgent = trajectories[trajectories.length - 1]?.agent;

  return (
    <div className="card mb-6">
      <h3 className="font-medium mb-4">Agent Workflow Graph</h3>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {GRAPH_NODES.map((node, i) => {
          const mapped = node.replace("readiness-pack", "evidence-gate");
          const done = completedAgents.has(mapped) || completedAgents.has(node);
          const active = lastAgent === mapped || lastAgent === node;
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold">Live Workflow</h2>
          <p className="text-sm text-[var(--muted)]">Run {id}</p>
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
          <h3 className="font-medium mb-2 text-[var(--warning)]">Human Approval Required</h3>
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
                <div className="flex items-center gap-2 text-sm">
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
        </div>
      </div>

      {selectedFinding && (
        <div className="card mt-6">
          <h3 className="font-medium mb-3">Evidence Chain — {selectedFinding}</h3>
          <EvidenceChain runId={id} findingId={selectedFinding} />
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
  );
}
