"use client";

export function ExpectationCard({
  statement,
  source,
  category,
  confidence,
}: {
  statement: string;
  source: string;
  category: string;
  confidence: number;
}) {
  return (
    <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--bg)] text-sm">
      <div className="flex gap-2 mb-1 text-xs">
        <span className="px-1.5 py-0.5 rounded border border-[var(--border)] font-mono">{category}</span>
        <span className="text-[var(--muted)]">confidence {(confidence * 100).toFixed(0)}%</span>
      </div>
      <p className="mb-1">{statement}</p>
      <p className="text-xs text-[var(--muted)] font-mono truncate" title={source}>
        source: {source}
      </p>
    </div>
  );
}
