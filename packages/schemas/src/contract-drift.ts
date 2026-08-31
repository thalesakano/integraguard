import { z } from "zod";

export const HttpMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

export const ExpectationCategorySchema = z.enum([
  "request-schema",
  "response-schema",
  "status-semantics",
  "authentication",
  "idempotency",
  "pagination",
  "rate-limit",
]);

export const DocumentedExpectationSchema = z.object({
  id: z.string(),
  endpoint: z.object({
    method: HttpMethodSchema,
    path: z.string(),
  }),
  category: ExpectationCategorySchema,
  statement: z.string(),
  source: z.object({
    url: z.string().optional(),
    section: z.string(),
    excerpt: z.string(),
  }),
  confidence: z.number().min(0).max(1),
  validationPredicate: z.string(),
  /** Optional operator/agent metadata (e.g. controlledAuthComparison) */
  metadata: z.record(z.unknown()).optional(),
});

export const RedactedRequestSchema = z.object({
  method: z.string(),
  url: z.string(),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
});

export const RedactedResponseSchema = z.object({
  statusCode: z.number(),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
});

export const ContractObservationSchema = z.object({
  probeId: z.string(),
  expectationId: z.string(),
  request: RedactedRequestSchema,
  response: RedactedResponseSchema,
  normalized: z.object({
    statusCode: z.number().optional(),
    bodyShape: z.unknown().optional(),
    headers: z.record(z.string()).optional(),
    durationMs: z.number(),
  }),
});

export const ContractDriftTypeSchema = z.enum([
  "required-field-added",
  "field-removed",
  "field-renamed",
  "type-changed",
  "response-shape-changed",
  "status-semantics-changed",
  "auth-changed",
  "idempotency-broken",
  "pagination-changed",
  "endpoint-missing",
]);

export const ContractDriftStatusSchema = z.enum([
  "candidate",
  "verified",
  "rejected",
  "inconclusive",
]);

export const ContractDriftSchema = z.object({
  id: z.string(),
  expectationId: z.string().min(1),
  type: ContractDriftTypeSchema,
  status: ContractDriftStatusSchema,
  evidenceIds: z.array(z.string()),
  summary: z.string(),
});

export type DocumentedExpectation = z.infer<typeof DocumentedExpectationSchema>;
export type ContractObservation = z.infer<typeof ContractObservationSchema>;
export type ContractDrift = z.infer<typeof ContractDriftSchema>;
export type ContractDriftType = z.infer<typeof ContractDriftTypeSchema>;
