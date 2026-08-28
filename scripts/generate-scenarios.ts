#!/usr/bin/env node
/** Generate remaining scenario files */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "scenarios");

const scenarios: Record<string, { gt: string; docs: string; openapi?: string; request: object }> = {
  "authorization-02": {
    gt: `case: authorization-02\nexpectedDecision: READY\nblockers: []\n`,
    docs: `# Claims API\n\nPOST /v1/claims\n\n| Field | Required |\n|-------|----------|\n| patientId | yes |\n| serviceCode | yes |\n`,
    request: { patientId: "PAT-001", serviceCode: "SRV-100" },
  },
  "authorization-04": {
    gt: `case: authorization-04\nexpectedDecision: BLOCKED\nblockers:\n  - id: BLK-001\n    severity: critical\n    type: undocumented-required-field\n`,
    docs: `# Pre-Authorization API\n\nPOST /v1/pre-authorization\n\n| Field | Required |\n|-------|----------|\n| beneficiary_id | yes |\n`,
    request: { beneficiary_id: "BEN-001" },
  },
  "authorization-05": {
    gt: `case: authorization-05\nexpectedDecision: BLOCKED\nblockers:\n  - id: BLK-001\n    severity: critical\n    type: auth-divergent\n`,
    docs: `# Pre-Authorization API\n\n## Authentication\n\nUse Bearer token in Authorization header.\n\nPOST /v1/pre-authorization\n`,
    request: { beneficiary_id: "BEN-001" },
  },
  "authorization-06": {
    gt: `case: authorization-06\nexpectedDecision: BLOCKED\nblockers:\n  - id: BLK-001\n    severity: critical\n    type: business-error-inside-http-200\n`,
    docs: `# Pre-Authorization API\n\nPOST /v1/pre-authorization\n\nErrors return HTTP 4xx.\n`,
    request: { beneficiary_id: "BEN-001", procedures: [{ code: "INVALID" }] },
  },
  "authorization-08": {
    gt: `case: authorization-08\nexpectedDecision: BLOCKED\nblockers:\n  - id: BLK-001\n    severity: critical\n    type: endpoint-not-found\n`,
    docs: `# Pre-Authorization API\n\nPOST /v1/pre-authorization\nGET /v1/pre-authorization/status\n`,
    request: { beneficiary_id: "BEN-001" },
  },
  "authorization-09": {
    gt: `case: authorization-09\nexpectedDecision: CONDITIONAL\nblockers:\n  - id: BLK-001\n    severity: major\n    type: pagination-inconsistent\n`,
    docs: `# Authorizations List\n\nGET /v1/authorizations?page=1&limit=10\n\nReturns totalPages and page.\n`,
    request: {},
  },
  "authorization-10": {
    gt: `case: authorization-10\nexpectedDecision: BLOCKED\nblockers:\n  - id: BLK-001\n    severity: major\n    type: missing-idempotency\n`,
    docs: `# Pre-Authorization API\n\nSupports Idempotency-Key for exactly-once submission.\n\nPOST /v1/pre-authorization\n`,
    request: { beneficiary_id: "BEN-001", procedures: [{ code: "789" }] },
  },
  "authorization-11": {
    gt: `case: authorization-11\nexpectedDecision: CONDITIONAL\nblockers:\n  - id: BLK-001\n    severity: major\n    type: rate-limit-undocumented\n`,
    docs: `# Pre-Authorization API\n\nPOST /v1/pre-authorization\n\nNo rate limits documented.\n`,
    request: { beneficiary_id: "BEN-001" },
  },
  "authorization-12": {
    gt: `case: authorization-12\nexpectedDecision: BLOCKED\nblockers:\n  - id: BLK-001\n    severity: critical\n    type: auth-divergent\n  - id: BLK-002\n    severity: critical\n    type: undocumented-required-field\n  - id: BLK-003\n    severity: critical\n    type: business-error-inside-http-200\n`,
    docs: `# Pre-Authorization API\n\n## Authentication\nBearer token required.\n\nPOST /v1/pre-authorization\n\n| beneficiary_id | yes |\n| effectiveDate | DD/MM/YYYY |\n`,
    request: { beneficiary_id: "BEN-001", effectiveDate: "28/08/2026", procedures: [{ code: "789" }] },
  },
};

for (const [id, data] of Object.entries(scenarios)) {
  const dir = join(ROOT, id);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "ground-truth.yaml"), data.gt);
  writeFileSync(join(dir, "api-docs.md"), data.docs);
  writeFileSync(join(dir, "sample-request.json"), JSON.stringify(data.request, null, 2) + "\n");
  if (!existsSync(join(dir, "openapi.yaml"))) {
    writeFileSync(join(dir, "openapi.yaml"), `openapi: "3.0.0"\ninfo:\n  title: API\n  version: "1.0"\npaths: {}\n`);
  }
}

console.log("Generated", Object.keys(scenarios).length, "scenarios");
