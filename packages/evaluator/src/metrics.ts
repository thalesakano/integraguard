import type { Evidence, Finding, GroundTruth } from "@integraguard/schemas";

const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 5,
  major: 3,
  minor: 1,
};

export interface EvalMetrics {
  weightedF1: number;
  precision: number;
  recall: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  unsupportedClaimRate: number;
  executableArtifactRate: number;
  decisionMatch: boolean;
}

export interface EvalResult {
  caseId: string;
  metrics: EvalMetrics;
  detectedBlockers: string[];
  missedBlockers: string[];
  falsePositiveBlockers: string[];
}

function isVerifiedFinding(f: Finding, evidences: Evidence[]): boolean {
  if (f.status !== "verified") return false;
  if (f.evidenceIds.length === 0) return false;
  return f.evidenceIds.every((id) => evidences.some((e) => e.id === id));
}

function matchBlocker(finding: Finding, gtBlocker: GroundTruth["blockers"][0]): boolean {
  if (finding.blockerType && finding.blockerType === gtBlocker.type) return true;
  const desc = finding.description.toLowerCase();
  const typeKeywords: Record<string, string[]> = {
    "undocumented-required-field": ["beneficiary", "required field", "missing field", "undocumented"],
    "business-error-inside-http-200": ["http 200", "businessstatus", "business status", "200 with error"],
    "missing-idempotency": ["idempoten", "duplicate", "idempotent"],
    "schema-divergent": ["schema", "diverg", "procedures", "beneficiary_id"],
    "auth-divergent": ["auth", "header", "api-key", "bearer"],
    "endpoint-not-found": ["404", "not found", "endpoint"],
    "pagination-inconsistent": ["pagination", "page", "cursor"],
    "rate-limit-undocumented": ["rate limit", "429"],
    "enum-format-error": ["enum", "format", "date"],
    "correct-contract": [],
  };
  const keywords = typeKeywords[gtBlocker.type] ?? [gtBlocker.type.replace(/-/g, " ")];
  return keywords.some((kw) => kw && desc.includes(kw));
}

export function computeMetrics(
  groundTruth: GroundTruth,
  findings: Finding[],
  evidences: Evidence[],
  decision: string,
  executableTests = 1,
  totalTests = 1
): EvalMetrics {
  const verifiedFindings = findings.filter((f) => isVerifiedFinding(f, evidences));
  const unverifiedOrRejected = findings.filter((f) => f.status !== "verified" || f.evidenceIds.length === 0);

  let tp = 0;
  let fp = 0;
  const matchedGt = new Set<string>();

  for (const finding of verifiedFindings) {
    const match = groundTruth.blockers.find(
      (gt) => !matchedGt.has(gt.id) && matchBlocker(finding, gt)
    );
    if (match) {
      tp++;
      matchedGt.add(match.id);
    } else if (groundTruth.blockers.length > 0) {
      fp++;
    }
  }

  const fn = groundTruth.blockers.filter((gt) => !matchedGt.has(gt.id)).length;
  const precision = tp + fp > 0 ? tp / (tp + fp) : groundTruth.blockers.length === 0 ? 1 : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;

  let weightedTp = 0;
  let weightedFp = 0;
  let weightedFn = 0;

  for (const gt of groundTruth.blockers) {
    const w = SEVERITY_WEIGHTS[gt.severity] ?? 1;
    if (matchedGt.has(gt.id)) weightedTp += w;
    else weightedFn += w;
  }
  weightedFp = verifiedFindings
    .filter((f) => !groundTruth.blockers.some((gt) => matchBlocker(f, gt)))
    .reduce((sum, f) => sum + (SEVERITY_WEIGHTS[f.severity] ?? 1), 0);

  const weightedPrecision = weightedTp + weightedFp > 0 ? weightedTp / (weightedTp + weightedFp) : 1;
  const weightedRecall = weightedTp + weightedFn > 0 ? weightedTp / (weightedTp + weightedFn) : 1;
  const weightedF1 =
    weightedPrecision + weightedRecall > 0
      ? (2 * weightedPrecision * weightedRecall) / (weightedPrecision + weightedRecall)
      : groundTruth.blockers.length === 0 ? 1 : 0;

  const totalClaims = findings.length || 1;
  const unsupportedClaimRate = unverifiedOrRejected.length / totalClaims;

  return {
    weightedF1,
    precision,
    recall,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    unsupportedClaimRate,
    executableArtifactRate: totalTests > 0 ? executableTests / totalTests : 1,
    decisionMatch: decision === groundTruth.expectedDecision,
  };
}

export function evaluateCase(
  groundTruth: GroundTruth,
  findings: Finding[],
  evidences: Evidence[],
  decision: string
): EvalResult {
  const metrics = computeMetrics(groundTruth, findings, evidences, decision);
  const verifiedFindings = findings.filter((f) => isVerifiedFinding(f, evidences));
  const matchedGt = new Set<string>();
  const detectedBlockers: string[] = [];

  for (const finding of verifiedFindings) {
    const match = groundTruth.blockers.find(
      (gt) => !matchedGt.has(gt.id) && matchBlocker(finding, gt)
    );
    if (match) {
      matchedGt.add(match.id);
      detectedBlockers.push(match.id);
    }
  }

  return {
    caseId: groundTruth.case,
    metrics,
    detectedBlockers,
    missedBlockers: groundTruth.blockers.filter((gt) => !matchedGt.has(gt.id)).map((gt) => gt.id),
    falsePositiveBlockers: verifiedFindings
      .filter((f) => !groundTruth.blockers.some((gt) => matchBlocker(f, gt)))
      .map((f) => f.id),
  };
}

export function aggregateMetrics(results: EvalResult[]): EvalMetrics {
  const n = results.length || 1;
  return {
    weightedF1: results.reduce((s, r) => s + r.metrics.weightedF1, 0) / n,
    precision: results.reduce((s, r) => s + r.metrics.precision, 0) / n,
    recall: results.reduce((s, r) => s + r.metrics.recall, 0) / n,
    truePositives: results.reduce((s, r) => s + r.metrics.truePositives, 0),
    falsePositives: results.reduce((s, r) => s + r.metrics.falsePositives, 0),
    falseNegatives: results.reduce((s, r) => s + r.metrics.falseNegatives, 0),
    unsupportedClaimRate: results.reduce((s, r) => s + r.metrics.unsupportedClaimRate, 0) / n,
    executableArtifactRate: results.reduce((s, r) => s + r.metrics.executableArtifactRate, 0) / n,
    decisionMatch: results.every((r) => r.metrics.decisionMatch),
  };
}
