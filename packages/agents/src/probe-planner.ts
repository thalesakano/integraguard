import type { ContractMapping, ProbePlan } from "@integraguard/schemas";
import { generateId } from "@integraguard/schemas";

export interface ProbePlannerInput {
  mappings: ContractMapping[];
  sampleRequest?: unknown;
  documentation: string;
}

export function runProbePlanner(input: ProbePlannerInput): ProbePlan[] {
  const probes: ProbePlan[] = [];
  const docsMentionIdempotency = /idempoten/i.test(input.documentation);
  const docsMentionBearer = /bearer/i.test(input.documentation);
  const docsMentionApiKey = /x-api-key|api.key/i.test(input.documentation);

  for (const mapping of input.mappings) {
    if (mapping.method === "POST") {
      probes.push({
        id: generateId("probe"),
        method: "POST",
        endpoint: mapping.endpoint,
        purpose: `Verify documented request schema for ${mapping.requirementId}`,
        sideEffectRisk: "medium",
        requiresApproval: true,
        body: input.sampleRequest ?? {},
      });

      const correctedBody = buildCorrectBody(input.sampleRequest, input.documentation);
      probes.push({
        id: generateId("probe"),
        method: "POST",
        endpoint: mapping.endpoint,
        purpose: "Verify required fields with working credentials",
        sideEffectRisk: "low",
        requiresApproval: false,
        body: input.sampleRequest ?? {},
        headers: buildCorrectHeaders(input.documentation),
      });

      probes.push({
        id: generateId("probe"),
        method: "POST",
        endpoint: mapping.endpoint,
        purpose: "Verify API response semantics with corrected payload",
        sideEffectRisk: "low",
        requiresApproval: false,
        body: correctedBody,
        headers: buildCorrectHeaders(input.documentation),
      });

      probes.push({
        id: generateId("probe"),
        method: "POST",
        endpoint: mapping.endpoint,
        purpose: "Verify business error handling (HTTP 200 vs 4xx)",
        sideEffectRisk: "low",
        requiresApproval: false,
        body: { ...correctedBody, procedures: [{ code: "INVALID" }] },
        headers: buildCorrectHeaders(input.documentation),
      });

      if (docsMentionIdempotency) {
        const idemKey = "integraguard-idem-test";
        probes.push({
          id: generateId("probe"),
          method: "POST",
          endpoint: mapping.endpoint,
          purpose: "Verify idempotency — first submission",
          sideEffectRisk: "medium",
          requiresApproval: true,
          body: correctedBody,
          headers: { "Idempotency-Key": idemKey, ...buildCorrectHeaders(input.documentation) },
        });
        probes.push({
          id: generateId("probe"),
          method: "POST",
          endpoint: mapping.endpoint,
          purpose: "Verify idempotency — duplicate submission",
          sideEffectRisk: "medium",
          requiresApproval: true,
          body: correctedBody,
          headers: { "Idempotency-Key": idemKey, ...buildCorrectHeaders(input.documentation) },
        });
      }
    } else if (mapping.method === "GET") {
      const basePath = mapping.endpoint.split("?")[0]!;
      const docsMentionPage = /page=|\?page|totalpages|total pages/i.test(input.documentation);

      probes.push({
        id: generateId("probe"),
        method: "GET",
        endpoint: docsMentionPage ? `${basePath}?page=1&limit=10` : basePath,
        purpose: `Verify ${basePath} exists and responds`,
        sideEffectRisk: "low",
        requiresApproval: false,
      });

      if (docsMentionPage) {
        probes.push({
          id: generateId("probe"),
          method: "GET",
          endpoint: `${basePath}?cursor=0&limit=10`,
          purpose: "Verify pagination contract (cursor vs page/limit)",
          sideEffectRisk: "low",
          requiresApproval: false,
        });
      }
    }
  }

  return probes;
}

function buildCorrectBody(sample: unknown, docs: string): Record<string, unknown> {
  const body = (sample && typeof sample === "object" ? { ...(sample as object) } : {}) as Record<string, unknown>;
  if (body.beneficiaryCard && !body.beneficiary_id) {
    body.beneficiary_id = String(body.beneficiaryCard);
    delete body.beneficiaryCard;
  }
  if (body.procedureCode && !body.procedures) {
    body.procedures = [{ code: String(body.procedureCode) }];
    delete body.procedureCode;
  }
  if (!body.beneficiary_id && docs.includes("beneficiary")) {
    body.beneficiary_id = "BEN-TEST-001";
  }
  if (!body.procedures) {
    body.procedures = [{ code: "789" }];
  }
  if (body.effectiveDate && typeof body.effectiveDate === "string") {
    const ddmmyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(body.effectiveDate);
    if (ddmmyyyy) {
      body.effectiveDate = `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
    }
  }
  if (docs.includes("providerTaxId") || !body.providerTaxId) {
    body.providerTaxId = "12.345.678/0001-99";
  }
  return body;
}

function buildDocAuthHeaders(docs: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (/bearer/i.test(docs) && !/x-api-key/i.test(docs)) {
    headers["Authorization"] = "Bearer test-token";
  }
  return headers;
}

function buildCorrectHeaders(docs: string): Record<string, string> {
  const headers: Record<string, string> = { "X-Provider-Id": "PROV-001", "X-API-Key": "test-api-key" };
  if (/bearer/i.test(docs)) {
    headers["Authorization"] = "Bearer test-token";
  }
  return headers;
}

function buildProbeHeaders(
  docs: string,
  docsMentionBearer: boolean,
  docsMentionApiKey: boolean
): Record<string, string> {
  return buildCorrectHeaders(docs);
}
