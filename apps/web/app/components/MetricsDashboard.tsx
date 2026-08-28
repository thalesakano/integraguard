"use client";

interface MetricsData {
  available: boolean;
  baseline?: {
    weightedF1: number;
    unsupportedClaimRate: number;
    precision: number;
    recall: number;
  };
  final?: {
    weightedF1: number;
    unsupportedClaimRate: number;
    precision: number;
    recall: number;
  };
  operational?: {
    medianRuntimeMs: number;
    totalRuntimeMs: number;
    totalVerifierRetries: number;
    costPerCaseUsd: number;
    scenarioCount: number;
  };
  caseResults?: { caseId: string; f1: number; runtimeMs?: number }[];
}

export function MetricsDashboard({ metrics }: { metrics: MetricsData }) {
  if (!metrics.available || !metrics.baseline || !metrics.final) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Run <code className="text-xs">pnpm eval:baseline && pnpm eval:final</code> to populate metrics.
      </p>
    );
  }

  const perfectCases =
    metrics.caseResults?.filter((c) => c.f1 >= 0.999).length ?? 0;
  const totalCases = metrics.caseResults?.length ?? metrics.operational?.scenarioCount ?? 12;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        <div className="p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
          <p className="text-2xl font-bold text-[var(--success)]">
            {metrics.final.weightedF1.toFixed(3)}
          </p>
          <p className="text-xs text-[var(--muted)]">Weighted F1</p>
        </div>
        <div className="p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
          <p className="text-2xl font-bold">
            +{(metrics.final.weightedF1 - metrics.baseline.weightedF1).toFixed(3)}
          </p>
          <p className="text-xs text-[var(--muted)]">vs Baseline</p>
        </div>
        <div className="p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
          <p className="text-2xl font-bold text-[var(--success)]">
            {perfectCases}/{totalCases}
          </p>
          <p className="text-xs text-[var(--muted)]">Scenarios @ F1 1.0</p>
        </div>
        <div className="p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
          <p className="text-2xl font-bold">
            {metrics.operational?.medianRuntimeMs
              ? `${Math.round(metrics.operational.medianRuntimeMs)}ms`
              : "—"}
          </p>
          <p className="text-xs text-[var(--muted)]">Median runtime/case</p>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
            <th className="pb-2">Metric</th>
            <th className="pb-2">V0 Baseline</th>
            <th className="pb-2">V4 Final</th>
            <th className="pb-2">Delta</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Weighted F1", metrics.baseline.weightedF1, metrics.final.weightedF1],
            ["Precision", metrics.baseline.precision, metrics.final.precision],
            ["Recall", metrics.baseline.recall, metrics.final.recall],
            ["Unsupported claims", metrics.baseline.unsupportedClaimRate, metrics.final.unsupportedClaimRate],
          ].map(([name, a, b]) => {
            const va = a as number;
            const vb = b as number;
            const delta = vb - va;
            return (
              <tr key={name as string} className="border-b border-[var(--border)]/50">
                <td className="py-2">{name}</td>
                <td>{va.toFixed(3)}</td>
                <td>{vb.toFixed(3)}</td>
                <td className={delta >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}>
                  {delta >= 0 ? "+" : ""}
                  {delta.toFixed(3)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {metrics.caseResults && metrics.caseResults.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Per-scenario F1</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
            {metrics.caseResults.map((c) => (
              <div
                key={c.caseId}
                className={`px-2 py-1.5 rounded border ${
                  c.f1 >= 0.999
                    ? "border-[var(--success)]/40 text-[var(--success)]"
                    : c.f1 >= 0.85
                      ? "border-[var(--warning)]/40 text-[var(--warning)]"
                      : "border-[var(--danger)]/40 text-[var(--danger)]"
                }`}
              >
                <span className="font-mono">{c.caseId.replace("authorization-", "")}</span>
                <span className="float-right">{c.f1.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {metrics.operational && (
        <p className="text-xs text-[var(--muted)]">
          Verifier retries: {metrics.operational.totalVerifierRetries} · Cost/case: $
          {metrics.operational.costPerCaseUsd.toFixed(4)} · Total eval:{" "}
          {(metrics.operational.totalRuntimeMs / 1000).toFixed(1)}s
        </p>
      )}
    </div>
  );
}
