"use client";

export function RunModeBadge({
  kind,
}: {
  kind: "agent" | "tool" | "human" | "gate" | "deterministic" | "replay";
}) {
  const styles: Record<string, string> = {
    agent: "border-[var(--accent)] text-[var(--accent)]",
    tool: "border-[var(--muted)] text-[var(--muted)]",
    human: "border-[var(--warning)] text-[var(--warning)]",
    gate: "border-[var(--success)] text-[var(--success)]",
    deterministic: "border-[var(--border)] text-[var(--muted)]",
    replay: "border-[var(--warning)] text-[var(--warning)]",
  };
  const labels: Record<string, string> = {
    agent: "Agent suggestion",
    tool: "Tool observation",
    human: "Human approval",
    gate: "Deterministic decision",
    deterministic: "Deterministic",
    replay: "Replay (offline)",
  };
  return (
    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${styles[kind]}`}>
      {labels[kind]}
    </span>
  );
}
