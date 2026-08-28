"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { EvidenceChainPanel } from "@/app/components/EvidenceChainPanel";
import { MetricsDashboard } from "@/app/components/MetricsDashboard";

interface EvidenceChainNode {
  findingId: string;
  requirement: string;
  docSource: string;
  hypothesis: string;
  httpMethod: string;
  httpEndpoint: string;
  httpStatus: string;
  httpResponse: string;
  verifier: string;
  test: string;
  blockerType?: string;
  severity: string;
  status: string;
}

export default function PackPage() {
  const params = useParams();
  const id = params.id as string;
  const [pack, setPack] = useState<{
    decision: string;
    readinessScore: number;
    findings: { severity: string; status: string; description: string }[];
    unansweredQuestions: string[];
    reportPreview: string;
  } | null>(null);
  const [metrics, setMetrics] = useState<Parameters<typeof MetricsDashboard>[0]["metrics"] | null>(null);
  const [chains, setChains] = useState<EvidenceChainNode[]>([]);

  useEffect(() => {
    fetch(`/api/analyses/${id}/pack`).then((r) => r.json()).then(setPack);
    fetch("/api/metrics").then((r) => r.json()).then(setMetrics);
    fetch(`/api/analyses/${id}/evidence-chains`)
      .then((r) => (r.ok ? r.json() : { chains: [] }))
      .then((data) => setChains(data.chains ?? []));
  }, [id]);

  if (!pack) return <p className="text-[var(--muted)]">Loading readiness pack...</p>;

  const critical = pack.findings.filter((f) => f.status === "verified" && f.severity === "critical").length;
  const major = pack.findings.filter((f) => f.status === "verified" && f.severity === "major").length;
  const verified = pack.findings.filter((f) => f.status === "verified").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href={`/runs/${id}`} className="text-sm text-[var(--accent)] hover:underline">← Back to workflow</Link>
          <h2 className="text-2xl font-semibold mt-2">Integration Readiness Pack</h2>
        </div>
        <a
          href={`/api/analyses/${id}/download`}
          className="bg-[var(--accent)] text-white px-4 py-2 rounded-lg text-sm"
        >
          Download ZIP
        </a>
      </div>

      <div className="card mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className={`text-3xl font-bold status-${pack.decision}`}>{pack.decision}</p>
            <p className="text-sm text-[var(--muted)]">Status</p>
          </div>
          <div>
            <p className="text-3xl font-bold">{pack.readinessScore}</p>
            <p className="text-sm text-[var(--muted)]">Readiness Score</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-[var(--danger)]">{critical}</p>
            <p className="text-sm text-[var(--muted)]">Critical Blockers</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-[var(--warning)]">{major}</p>
            <p className="text-sm text-[var(--muted)]">Major Issues</p>
          </div>
        </div>
        <p className="text-center text-sm text-[var(--muted)] mt-4">
          {verified} verified findings · {pack.unansweredQuestions.length} unanswered questions
        </p>
      </div>

      {metrics && (
        <div className="card mb-6">
          <h3 className="font-medium mb-3">Baseline vs Final (12 scenarios)</h3>
          <MetricsDashboard metrics={metrics} />
        </div>
      )}

      <div className="card mb-6">
        <h3 className="font-medium mb-1">Evidence Chain</h3>
        <p className="text-xs text-[var(--muted)] mb-4">
          Every verified finding traced: Requirement → Doc → Hypothesis → HTTP probe → Verifier → Test
        </p>
        <EvidenceChainPanel chains={chains} />
      </div>

      <div className="card mb-6">
        <h3 className="font-medium mb-3">Report Preview</h3>
        <pre className="text-xs bg-[var(--bg)] p-4 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-[400px] overflow-y-auto">
          {pack.reportPreview}
        </pre>
      </div>

      <div className="card">
        <h3 className="font-medium mb-3">Artifacts</h3>
        <ul className="text-sm space-y-2 text-[var(--muted)]">
          <li>integration-readiness-report.md</li>
          <li>contract-tests/ (Vitest — fails reproduce blockers)</li>
          <li>postman-collection.json</li>
          <li>typescript-client.ts</li>
          <li>vendor-clarification-email.md</li>
          <li>agent-trajectories.json</li>
        </ul>
      </div>
    </div>
  );
}
