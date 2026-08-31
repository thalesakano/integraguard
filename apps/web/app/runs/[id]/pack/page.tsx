"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { EvidenceChainPanel } from "@/app/components/EvidenceChainPanel";
import { ContractDiffPanel } from "@/app/components/ContractDiffPanel";
import { ExpectationCard } from "@/app/components/ExpectationCard";
import { RunModeBadge } from "@/app/components/RunModeBadge";
import {
  InvestigationActions,
  buildMinimalReproduction,
  buildVendorQuestion,
} from "@/app/components/InvestigationActions";

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

interface PackFinding {
  id?: string;
  severity: string;
  status: string;
  description: string;
  blockerType?: string;
  requirementId?: string;
}

interface RunSummary {
  goal: string;
  sandboxUrl: string;
  targetMode: string;
  scenarioId?: string;
  endpointCount: number;
  endpoints: { method: string; path: string }[];
  requirementCount: number;
  verifiedFindingCount: number;
  criticalCount: number;
  majorCount: number;
  unansweredCount: number;
  mappingCount: number;
  sampleRequest?: unknown;
}

export default function PackPage() {
  const params = useParams();
  const id = params.id as string;
  const [pack, setPack] = useState<{
    decision: string;
    readinessScore: number;
    findings: PackFinding[];
    unansweredQuestions: string[];
    reportPreview: string;
    mappings?: { method: string; endpoint: string; requirementId: string; confidence: number }[];
    requirements?: { id: string; description: string }[];
    runSummary?: RunSummary;
  } | null>(null);
  const [chains, setChains] = useState<EvidenceChainNode[]>([]);

  useEffect(() => {
    fetch(`/api/analyses/${id}/pack`).then((r) => r.json()).then(setPack);
    fetch(`/api/analyses/${id}/evidence-chains`)
      .then((r) => (r.ok ? r.json() : { chains: [] }))
      .then((data) => setChains(data.chains ?? []));
  }, [id]);

  if (!pack) return <p className="text-[var(--muted)]">Loading readiness pack...</p>;

  const critical = pack.findings.filter((f) => f.status === "verified" && f.severity === "critical").length;
  const major = pack.findings.filter((f) => f.status === "verified" && f.severity === "major").length;
  const verified = pack.findings.filter((f) => f.status === "verified");
  const inconclusive = pack.findings.filter((f) => f.status !== "verified");
  const summary = pack.runSummary;
  const endpoints = summary?.endpoints ?? [];
  const baseUrl = summary?.sandboxUrl ?? "";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href={`/runs/${id}`} className="text-sm text-[var(--accent)] hover:underline">
            ← Back to workflow
          </Link>
          <h2 className="text-2xl font-semibold mt-2">Integration Readiness Pack</h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            Results for this analysis run only — not the fixed hackathon eval suite.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <RunModeBadge kind="gate" />
            <RunModeBadge kind="tool" />
            <RunModeBadge kind="agent" />
          </div>
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
          {verified.length} verified findings · {pack.unansweredQuestions.length} unanswered questions
        </p>
      </div>

      {summary && (
        <div className="card mb-6">
          <h3 className="font-medium mb-1">This run</h3>
          <p className="text-xs text-[var(--muted)] mb-4">
            Derived from the docs/OpenAPI and probes executed for run <span className="font-mono">{id}</span>
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center mb-4">
            <div className="p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
              <p className="text-2xl font-bold">{summary.endpointCount}</p>
              <p className="text-xs text-[var(--muted)]">Endpoints mapped</p>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
              <p className="text-2xl font-bold">{summary.requirementCount}</p>
              <p className="text-xs text-[var(--muted)]">Requirements</p>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
              <p className="text-2xl font-bold">{summary.mappingCount}</p>
              <p className="text-xs text-[var(--muted)]">Req ↔ endpoint links</p>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
              <p className="text-2xl font-bold">{summary.verifiedFindingCount}</p>
              <p className="text-xs text-[var(--muted)]">Verified findings</p>
            </div>
          </div>
          <p className="text-sm mb-2">
            <span className="text-[var(--muted)]">Goal:</span> {summary.goal}
          </p>
          <p className="text-sm mb-3 font-mono text-xs">
            <span className="text-[var(--muted)] font-sans text-sm">Base URL:</span> {summary.sandboxUrl}
          </p>
          {endpoints.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {endpoints.map((ep) => (
                <span
                  key={`${ep.method}-${ep.path}`}
                  className="px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--bg)] font-mono text-[10px]"
                >
                  {ep.method} {ep.path}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {(pack.requirements?.length ?? 0) > 0 && (
        <div className="card mb-6">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-medium">Documented expectations</h3>
            <RunModeBadge kind="agent" />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {pack.requirements!.slice(0, 6).map((r) => (
              <ExpectationCard
                key={r.id}
                statement={r.description}
                source={r.id}
                category="requirement"
                confidence={0.8}
              />
            ))}
          </div>
        </div>
      )}

      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="font-medium">Contract drift (documented vs observed)</h3>
          <RunModeBadge kind="gate" />
        </div>
        <p className="text-xs text-[var(--muted)] mb-4">
          Verified mismatches between documentation and runtime probes for this run.
        </p>
        <div className="space-y-3">
          {verified.map((f, i) => {
            const mapping =
              pack.mappings?.find((m) => m.requirementId === f.requirementId) ??
              pack.mappings?.[0];
            const method = mapping?.method ?? "POST";
            const endpoint = mapping?.endpoint ?? "/";
            const chain = chains.find((c) => c.findingId === f.id);
            return (
              <ContractDiffPanel
                key={`${f.description}-${i}`}
                status="DRIFT"
                documented={{
                  label: "Documented",
                  fields: [
                    {
                      name: "Expectation from docs",
                      detail: f.description.slice(0, 120),
                      tone: "removed",
                    },
                  ],
                }}
                observed={{
                  label: "Observed",
                  fields: [
                    {
                      name: f.blockerType ?? f.severity,
                      detail: chain
                        ? `HTTP ${chain.httpStatus}: ${chain.httpResponse.slice(0, 80)}`
                        : "Verified via HTTP probe + Evidence Gate",
                      tone: "added",
                    },
                  ],
                }}
                actions={
                  <InvestigationActions
                    reproduction={buildMinimalReproduction({
                      method,
                      endpoint,
                      baseUrl,
                      body: summary?.sampleRequest,
                      finding: f.description,
                    })}
                    vendorQuestion={buildVendorQuestion({
                      finding: f.description,
                      blockerType: f.blockerType,
                      method,
                      endpoint,
                    })}
                  />
                }
              />
            );
          })}
          {pack.unansweredQuestions.slice(0, 3).map((q, i) => (
            <ContractDiffPanel
              key={`q-${i}`}
              status="INCONCLUSIVE"
              documented={{
                label: "Documented",
                fields: [{ name: "Open validation gap" }],
              }}
              observed={{
                label: "Observed",
                fields: [{ name: q, tone: "changed" }],
              }}
              nextProbeReason={q}
            />
          ))}
          {verified.length === 0 && pack.unansweredQuestions.length === 0 && (
            <ContractDiffPanel
              status="MATCH"
              documented={{ label: "Documented", fields: [{ name: "Contract expectations" }] }}
              observed={{ label: "Observed", fields: [{ name: "No verified drift", tone: "same" }] }}
            />
          )}
        </div>
        {inconclusive.length > 0 && verified.length > 0 && (
          <p className="text-xs text-[var(--muted)] mt-3">
            {inconclusive.length} candidate/inconclusive finding(s) remain visible but were not promoted by the Evidence Gate.
          </p>
        )}
      </div>

      <div className="card mb-6">
        <h3 className="font-medium mb-1">Evidence Chain</h3>
        <p className="text-xs text-[var(--muted)] mb-4">
          Verified findings from this run: Requirement → Doc → Hypothesis → HTTP probe → Verifier → Test
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
        <p className="text-xs text-[var(--muted)] mb-3">
          ZIP contents are generated from this run&apos;s mappings, sample request, and findings.
        </p>
        <ul className="text-sm space-y-2 text-[var(--muted)]">
          <li>integration-readiness-report.md</li>
          <li>contract-tests/ (Vitest — targets mapped endpoints from this run)</li>
          <li>postman-collection.json</li>
          <li>typescript-client.ts</li>
          <li>vendor-clarification-email.md</li>
          <li>vendor-issue.md</li>
          <li>agent-trajectories.json</li>
        </ul>
      </div>
    </div>
  );
}
