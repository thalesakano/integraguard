"use client";

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

function ChainStep({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</span>
      <span
        className="text-xs truncate mt-0.5 px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--bg)]"
        style={accent ? { borderColor: accent, color: accent } : undefined}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

export function EvidenceChainPanel({ chains }: { chains: EvidenceChainNode[] }) {
  if (chains.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        No verified findings with evidence chains yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {chains.map((chain) => (
        <div
          key={chain.findingId}
          className="border border-[var(--border)] rounded-lg p-4 bg-[var(--bg)]"
        >
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded ${
                chain.severity === "critical"
                  ? "bg-[var(--danger)]/20 text-[var(--danger)]"
                  : "bg-[var(--warning)]/20 text-[var(--warning)]"
              }`}
            >
              {chain.severity}
            </span>
            {chain.blockerType && (
              <span className="text-xs text-[var(--muted)] font-mono">{chain.blockerType}</span>
            )}
            <span className="text-xs text-[var(--success)]">verified</span>
          </div>

          <p className="text-sm mb-3">{chain.hypothesis}</p>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 items-end">
            <ChainStep label="Requirement" value={chain.requirement} accent="var(--accent)" />
            <ChainStep label="Doc source" value={chain.docSource} />
            <ChainStep
              label="HTTP probe"
              value={`${chain.httpStatus} · ${chain.httpEndpoint}`}
              accent={
                chain.httpStatus.startsWith("4") || chain.httpStatus.startsWith("5")
                  ? "var(--danger)"
                  : "var(--success)"
              }
            />
            <ChainStep label="Observation" value={chain.httpResponse} />
            <ChainStep label="Verifier" value={chain.verifier} accent="var(--success)" />
            <ChainStep label="Test artifact" value={chain.test} />
          </div>

          <div className="mt-3 flex items-center gap-1 text-[10px] text-[var(--muted)] overflow-x-auto">
            <span className="px-2 py-1 rounded border border-[var(--border)] whitespace-nowrap">
              {chain.requirement}
            </span>
            <span>→</span>
            <span className="px-2 py-1 rounded border border-[var(--border)] whitespace-nowrap">Doc</span>
            <span>→</span>
            <span className="px-2 py-1 rounded border border-[var(--border)] whitespace-nowrap">
              Hypothesis
            </span>
            <span>→</span>
            <span className="px-2 py-1 rounded border border-[var(--warning)] text-[var(--warning)] whitespace-nowrap">
              HTTP {chain.httpStatus}
            </span>
            <span>→</span>
            <span className="px-2 py-1 rounded border border-[var(--success)] text-[var(--success)] whitespace-nowrap">
              Verified
            </span>
            <span>→</span>
            <span className="px-2 py-1 rounded border border-[var(--accent)] text-[var(--accent)] whitespace-nowrap">
              Test
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
