/**
 * Pure CLI exit-code helper — kept separate so tests do not spawn the binary.
 *
 * Exit codes:
 *   0 — READY / no verified drift and no critical unanswered questions
 *   1 — verified drift / BLOCKED
 *   3 — inconclusive / paused / CONDITIONAL with open questions
 */
import type { ReadinessPack } from "@integraguard/schemas";

export function exitCodeForPack(pack: ReadinessPack, paused: boolean): 0 | 1 | 3 {
  if (paused) return 3;

  const drifts = pack.findings.filter((f) => f.status === "verified");
  if (drifts.length > 0 || pack.decision === "BLOCKED") return 1;

  if (pack.unansweredQuestions.length > 0) return 3;
  if (pack.decision === "CONDITIONAL") return 3;
  if (pack.decision !== "READY") return 3;

  return 0;
}
