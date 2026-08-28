import { z } from "zod";

export const EvidenceTypeSchema = z.enum([
  "document",
  "http_probe",
  "schema_validation",
  "test_result",
]);

export const EvidenceSchema = z.object({
  id: z.string(),
  type: EvidenceTypeSchema,
  sourceReference: z.string(),
  observation: z.string(),
  payload: z.unknown().optional(),
});

export const FindingSeveritySchema = z.enum(["critical", "major", "minor"]);
export const FindingStatusSchema = z.enum(["verified", "unverified", "rejected"]);

export const FindingSchema = z.object({
  id: z.string(),
  requirementId: z.string(),
  severity: FindingSeveritySchema,
  status: FindingStatusSchema,
  evidenceIds: z.array(z.string()),
  description: z.string(),
  blockerType: z.string().optional(),
});

export const ReadinessDecisionSchema = z.enum(["READY", "CONDITIONAL", "BLOCKED"]);

export const RequirementSchema = z.object({
  id: z.string(),
  description: z.string(),
  severity: FindingSeveritySchema,
});

export const SourceReferenceSchema = z.object({
  file: z.string(),
  section: z.string().optional(),
  line: z.number().optional(),
});

export const ContractMappingSchema = z.object({
  requirementId: z.string(),
  endpoint: z.string(),
  method: z.string().default("POST"),
  source: SourceReferenceSchema,
  confidence: z.number().min(0).max(1),
});

export const SideEffectRiskSchema = z.enum(["low", "medium", "high"]);

export const ProbePlanSchema = z.object({
  id: z.string(),
  method: z.string(),
  endpoint: z.string(),
  purpose: z.string(),
  sideEffectRisk: SideEffectRiskSchema,
  requiresApproval: z.boolean(),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
});

export const HttpProbeResultSchema = z.object({
  probeId: z.string(),
  statusCode: z.number(),
  headers: z.record(z.string()),
  body: z.unknown(),
  durationMs: z.number(),
  error: z.string().optional(),
});

export const VerifierDecisionSchema = z.object({
  findingId: z.string(),
  action: z.enum(["accept", "reject", "request_probe"]),
  reason: z.string(),
  additionalProbeId: z.string().optional(),
});

export const TrajectoryEventSchema = z.object({
  runId: z.string(),
  agent: z.string(),
  instructionVersion: z.string(),
  inputEvidenceIds: z.array(z.string()).optional(),
  action: z.string(),
  reason: z.string().optional(),
  toolCallId: z.string().optional(),
  retry: z.number().default(0),
  timestamp: z.string(),
  payload: z.unknown().optional(),
});

export const AnalysisInputSchema = z.object({
  goal: z.string(),
  documentation: z.string(),
  openApiSpec: z.string().optional(),
  sampleRequest: z.unknown().optional(),
  sampleResponse: z.unknown().optional(),
  sandboxUrl: z.string().url(),
  scenarioId: z.string().optional(),
  allowedOperations: z.array(z.string()).default(["GET", "POST"]),
  useLlm: z.boolean().optional(),
  targetMode: z.enum(["sandbox", "custom", "real-api"]).optional(),
});

export const ReadinessPackSchema = z.object({
  runId: z.string(),
  decision: ReadinessDecisionSchema,
  readinessScore: z.number().min(0).max(100),
  requirements: z.array(RequirementSchema),
  findings: z.array(FindingSchema),
  evidences: z.array(EvidenceSchema),
  unansweredQuestions: z.array(z.string()),
  mappings: z.array(ContractMappingSchema),
  generatedAt: z.string(),
});

export const GroundTruthBlockerSchema = z.object({
  id: z.string(),
  severity: FindingSeveritySchema,
  type: z.string(),
  description: z.string().optional(),
});

export const GroundTruthSchema = z.object({
  case: z.string(),
  expectedDecision: ReadinessDecisionSchema,
  blockers: z.array(GroundTruthBlockerSchema),
});

export type Evidence = z.infer<typeof EvidenceSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type ReadinessDecision = z.infer<typeof ReadinessDecisionSchema>;
export type Requirement = z.infer<typeof RequirementSchema>;
export type ContractMapping = z.infer<typeof ContractMappingSchema>;
export type ProbePlan = z.infer<typeof ProbePlanSchema>;
export type HttpProbeResult = z.infer<typeof HttpProbeResultSchema>;
export type VerifierDecision = z.infer<typeof VerifierDecisionSchema>;
export type TrajectoryEvent = z.infer<typeof TrajectoryEventSchema>;
export type AnalysisInput = z.infer<typeof AnalysisInputSchema>;
export type ReadinessPack = z.infer<typeof ReadinessPackSchema>;
export type GroundTruth = z.infer<typeof GroundTruthSchema>;

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
