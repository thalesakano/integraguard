"use client";

import type { ReactNode } from "react";

export type DiffSide = {
  label: string;
  fields: { name: string; detail?: string; tone?: "added" | "removed" | "changed" | "same" }[];
};

export function ContractDiffPanel({
  documented,
  observed,
  status,
  nextProbeReason,
  actions,
}: {
  documented: DiffSide;
  observed: DiffSide;
  status: "MATCH" | "DRIFT" | "INCONCLUSIVE";
  nextProbeReason?: string;
  actions?: ReactNode;
}) {
  const statusColor =
    status === "MATCH"
      ? "text-[var(--success)] border-[var(--success)]"
      : status === "DRIFT"
        ? "text-[var(--danger)] border-[var(--danger)]"
        : "text-[var(--warning)] border-[var(--warning)]";

  return (
    <div className="border border-[var(--border)] rounded-lg p-4 bg-[var(--bg)]">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium">Documented vs Observed</h4>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${statusColor}`}>
          {status}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        {[documented, observed].map((side) => (
          <div key={side.label}>
            <p className="text-xs uppercase tracking-wide text-[var(--muted)] mb-2">{side.label}</p>
            <ul className="space-y-1 font-mono text-xs">
              {side.fields.map((f) => (
                <li
                  key={`${side.label}-${f.name}`}
                  className={
                    f.tone === "added"
                      ? "text-[var(--danger)]"
                      : f.tone === "removed"
                        ? "text-[var(--warning)] line-through"
                        : f.tone === "changed"
                          ? "text-[var(--accent)]"
                          : "text-[var(--text)]"
                  }
                >
                  {f.name}
                  {f.detail ? <span className="text-[var(--muted)]"> — {f.detail}</span> : null}
                </li>
              ))}
              {side.fields.length === 0 && (
                <li className="text-[var(--muted)]">(no fields)</li>
              )}
            </ul>
          </div>
        ))}
      </div>
      {nextProbeReason && (
        <p className="mt-3 text-xs text-[var(--muted)] border-t border-[var(--border)] pt-2">
          Next probe reason: {nextProbeReason}
        </p>
      )}
      {actions && <div className="mt-3">{actions}</div>}
    </div>
  );
}

// Re-exports for existing imports
export { ExpectationCard } from "./ExpectationCard";
export { RunModeBadge } from "./RunModeBadge";
