import type {
  Evidence,
  Finding,
  HttpProbeResult,
  VerifierDecision,
} from "@integraguard/schemas";
import { generateId } from "@integraguard/schemas";

export interface VerifierInput {
  candidateFindings: Finding[];
  evidences: Evidence[];
  probeResults: HttpProbeResult[];
  documentation: string;
}

export function runAdversarialVerifier(input: VerifierInput): {
  decisions: VerifierDecision[];
  findings: Finding[];
  additionalProbes: string[];
} {
  const decisions: VerifierDecision[] = [];
  const findings: Finding[] = [];
  const additionalProbes: string[] = [];

  for (const candidate of input.candidateFindings) {
    const linkedEvidence = input.evidences.filter((e) => candidate.evidenceIds.includes(e.id));

    if (linkedEvidence.length === 0) {
      decisions.push({
        findingId: candidate.id,
        action: "reject",
        reason: "No evidence linked to finding",
      });
      continue;
    }

    const hasHttpEvidence = linkedEvidence.some((e) => e.type === "http_probe");
    const isRuntimeBlocker = [
      "undocumented-required-field",
      "business-error-inside-http-200",
      "schema-divergent",
      "auth-divergent",
      "endpoint-not-found",
      "missing-idempotency",
      "rate-limit-undocumented",
      "pagination-inconsistent",
    ].includes(candidate.blockerType ?? "");

    if (isRuntimeBlocker && !hasHttpEvidence) {
      decisions.push({
        findingId: candidate.id,
        action: "request_probe",
        reason: "Runtime blocker requires HTTP probe evidence",
      });
      additionalProbes.push(candidate.id);
      continue;
    }

    const docEvidence = linkedEvidence.some((e) => e.type === "document");
    if (!docEvidence && !hasHttpEvidence) {
      decisions.push({
        findingId: candidate.id,
        action: "reject",
        reason: "Finding lacks verifiable document or probe evidence",
      });
      continue;
    }

    decisions.push({
      findingId: candidate.id,
      action: "accept",
      reason: "Evidence supports conclusion",
    });
    findings.push({ ...candidate, status: "verified" });
  }

  return { decisions, findings, additionalProbes };
}

export function analyzeProbeResults(
  probeResults: HttpProbeResult[],
  documentation: string,
  requirements: { id: string }[],
  probePurposes: Record<string, string> = {},
  probeMeta: Record<string, { method: string; endpoint: string }> = {}
): { findings: Finding[]; evidences: Evidence[] } {
  const findings: Finding[] = [];
  const evidences: Evidence[] = [];

  for (const result of probeResults) {
    const evId = generateId("EVD");
    const meta = probeMeta[result.probeId];
    const endpointLabel = meta
      ? `${meta.method} ${meta.endpoint}`
      : `probe:${result.probeId}`;
    evidences.push({
      id: evId,
      type: "http_probe",
      sourceReference: endpointLabel,
      observation: result.error
        ? `Probe failed: ${result.error}`
        : `HTTP ${result.statusCode} in ${result.durationMs}ms`,
      payload: {
        ...result,
        method: meta?.method,
        endpoint: meta?.endpoint,
        purpose: probePurposes[result.probeId],
      },
    });

    const body = result.body as Record<string, unknown> | null;

    if (result.statusCode === 400 && body) {
      const msg = JSON.stringify(body).toLowerCase();
      if (msg.includes("beneficiary_id") && documentation.includes("beneficiaryCard")) {
        if (msg.includes("invalid schema") || msg.includes("expected beneficiary_id")) {
          findings.push({
            id: generateId("FND"),
            requirementId: requirements[0]?.id ?? "REQ-001",
            severity: "major",
            status: "unverified",
            evidenceIds: [evId],
            description: "Schema divergent: documented fields do not match API expectations",
            blockerType: "schema-divergent",
          });
        } else {
          findings.push({
            id: generateId("FND"),
            requirementId: requirements[0]?.id ?? "REQ-001",
            severity: "critical",
            status: "unverified",
            evidenceIds: [evId],
            description: "Undocumented required field: API expects beneficiary_id but documentation shows beneficiaryCard",
            blockerType: "undocumented-required-field",
          });
        }
      }
      if (msg.includes("providertaxid")) {
        findings.push({
          id: generateId("FND"),
          requirementId: requirements[0]?.id ?? "REQ-001",
          severity: "critical",
          status: "unverified",
          evidenceIds: [evId],
          description: "Undocumented required field providerTaxId",
          blockerType: "undocumented-required-field",
        });
      }

      // Generic: runtime requires a field not present in documentation
      const requiredField =
        msg.match(/([a-zA-Z_][\w]*)\s+is required/i)?.[1] ??
        msg.match(/required[:\s]+["']?([a-zA-Z_][\w]*)/i)?.[1];
      if (requiredField && !new RegExp(`\\b${requiredField}\\b`, "i").test(documentation)) {
        const already = findings.some(
          (f) =>
            f.blockerType === "undocumented-required-field" &&
            f.description.toLowerCase().includes(requiredField.toLowerCase())
        );
        if (!already) {
          findings.push({
            id: generateId("FND"),
            requirementId: requirements[0]?.id ?? "REQ-001",
            severity: "critical",
            status: "unverified",
            evidenceIds: [evId],
            description: `Undocumented required field: API expects ${requiredField} but documentation does not mention it`,
            blockerType: "undocumented-required-field",
          });
        }
      }
      if (msg.includes("x-provider-id") || msg.includes("provider-id")) {
        findings.push({
          id: generateId("FND"),
          requirementId: requirements[0]?.id ?? "REQ-001",
          severity: "major",
          status: "unverified",
          evidenceIds: [evId],
          description: "Undocumented required header X-Provider-Id",
          blockerType: "undocumented-required-field",
        });
      }
      if (msg.includes("invalid schema") || msg.includes("expected beneficiary_id")) {
        findings.push({
          id: generateId("FND"),
          requirementId: requirements[0]?.id ?? "REQ-001",
          severity: "major",
          status: "unverified",
          evidenceIds: [evId],
          description: "Schema divergent: documented fields do not match API expectations",
          blockerType: "schema-divergent",
        });
      }
    }

    if (result.statusCode === 401) {
      findings.push({
        id: generateId("FND"),
        requirementId: "REQ-005",
        severity: "critical",
        status: "unverified",
        evidenceIds: [evId],
        description: "Authentication divergent: API rejected credentials (expected different auth method)",
        blockerType: "auth-divergent",
      });
    }

    if (result.statusCode === 404) {
      findings.push({
        id: generateId("FND"),
        requirementId: requirements[2]?.id ?? "REQ-003",
        severity: "critical",
        status: "unverified",
        evidenceIds: [evId],
        description: "Documented endpoint returns 404 — not implemented",
        blockerType: "endpoint-not-found",
      });
    }

    if (result.statusCode === 429) {
      findings.push({
        id: generateId("FND"),
        requirementId: requirements[0]?.id ?? "REQ-001",
        severity: "major",
        status: "unverified",
        evidenceIds: [evId],
        description: "Undocumented rate limit (HTTP 429)",
        blockerType: "rate-limit-undocumented",
      });
    }

    if (result.statusCode === 200 && body) {
      if (body.businessStatus === "error" || body.status === "rejected" || body.settlementState === "DECLINED") {
        findings.push({
          id: generateId("FND"),
          requirementId: requirements[1]?.id ?? "REQ-002",
          severity: "critical",
          status: "unverified",
          evidenceIds: [evId],
          description:
            "HTTP 200 returned with business rejection payload — documentation claims errors use 4xx/5xx",
          blockerType: "business-error-inside-http-200",
        });
      }

      const purpose = probePurposes[result.probeId] ?? "";
      const docsPromisePage = /totalpages|total pages|\?page=|page and limit/i.test(documentation);
      const hasCursor = "nextCursor" in body || "cursor" in body;
      const missingTotalPages = !("totalPages" in body) && !("page" in body);
      if (
        (purpose.includes("pagination") || docsPromisePage) &&
        hasCursor &&
        missingTotalPages &&
        documentation.toLowerCase().includes("totalpages")
      ) {
        findings.push({
          id: generateId("FND"),
          requirementId: "REQ-007",
          severity: "major",
          status: "unverified",
          evidenceIds: [evId],
          description: "Pagination inconsistent: documentation promises page/totalPages but API returns cursor-based pagination",
          blockerType: "pagination-inconsistent",
        });
      }
    }
  }

  // Idempotency: compare explicit duplicate submission probes
  const duplicateProbe = probeResults.find((r) => probePurposes[r.probeId]?.includes("duplicate submission"));
  const firstProbe = probeResults.find((r) => probePurposes[r.probeId]?.includes("first submission"));
  if (/idempoten/i.test(documentation) && duplicateProbe && firstProbe) {
    const idA = (firstProbe.body as Record<string, unknown>)?.authorizationId;
    const idB = (duplicateProbe.body as Record<string, unknown>)?.authorizationId;
    if (idA && idB && idA !== idB) {
      const evId = generateId("EVD");
      evidences.push({
        id: evId,
        type: "http_probe",
        sourceReference: "idempotency-duplicate-pair",
        observation: `Duplicate Idempotency-Key produced different IDs: ${String(idA)} vs ${String(idB)}`,
        payload: { idA, idB },
      });
      findings.push({
        id: generateId("FND"),
        requirementId: "REQ-004",
        severity: "major",
        status: "unverified",
        evidenceIds: [evId],
        description: "Missing idempotency: documentation claims exactly-once but duplicate submissions create new resources",
        blockerType: "missing-idempotency",
      });
    }
  } else if (/idempoten/i.test(documentation)) {
    const successResults = probeResults.filter(
      (r) => r.statusCode === 200 && (r.body as Record<string, unknown>)?.authorizationId
    );
    if (successResults.length >= 2) {
      const ids = successResults.map((r) => (r.body as Record<string, unknown>).authorizationId);
      const uniqueIds = new Set(ids);
      if (uniqueIds.size > 1) {
        const evId = generateId("EVD");
        evidences.push({
          id: evId,
          type: "http_probe",
          sourceReference: "idempotency-check",
          observation: "Duplicate submissions produced different authorizationIds",
          payload: { ids: [...uniqueIds] },
        });
        findings.push({
          id: generateId("FND"),
          requirementId: "REQ-004",
          severity: "major",
          status: "unverified",
          evidenceIds: [evId],
          description: "Missing idempotency: documentation claims exactly-once but duplicates created",
          blockerType: "missing-idempotency",
        });
      }
    }
  }

  return { findings, evidences };
}

