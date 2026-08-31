import { z } from "zod";
import type { ZodTypeAny } from "zod";
import {
  ContractDriftSchema,
  DocumentedExpectationSchema,
} from "./contract-drift.js";

/** Compact observation stored on agentic runs (redacted; no secrets). */
export const AgenticObservationSchema = z.object({
  probeId: z.string(),
  expectationId: z.string(),
  statusCode: z.number(),
  body: z.unknown(),
  error: z.string().optional(),
  durationMs: z.number(),
});

export interface AgenticCheckpointSchemaDeps {
  AnalysisInputSchema: ZodTypeAny;
  ProbePlanSchema: ZodTypeAny;
  HttpProbeResultSchema: ZodTypeAny;
  EvidenceSchema: ZodTypeAny;
  RequirementSchema: ZodTypeAny;
  ContractMappingSchema: ZodTypeAny;
  FindingSchema: ZodTypeAny;
  TrajectoryEventSchema: ZodTypeAny;
  ReadinessPackSchema: ZodTypeAny;
}

/**
 * Durable agentic workflow checkpoint — restore exact state on resume.
 * Never includes executionHeaders or other secret values.
 */
export function buildAgenticCheckpointSchema(deps: AgenticCheckpointSchemaDeps) {
  return z.object({
    runId: z.string(),
    /** AnalysisInput only — no secret header values. */
    input: deps.AnalysisInputSchema,
    useLlm: z.boolean(),
    autoApprove: z.boolean(),
    maxProbes: z.number().int().positive(),
    probesUsed: z.number().int().nonnegative(),
    loopCount: z.number().int().nonnegative(),
    maxLoops: z.number().int().positive(),
    expectations: z.array(DocumentedExpectationSchema),
    probePlans: z.array(deps.ProbePlanSchema),
    probeQueue: z.array(deps.ProbePlanSchema),
    pendingApprovals: z.array(deps.ProbePlanSchema),
    approvedProbeIds: z.array(z.string()),
    probeResults: z.array(deps.HttpProbeResultSchema),
    observations: z.array(AgenticObservationSchema),
    driftCandidates: z.array(ContractDriftSchema),
    evidences: z.array(deps.EvidenceSchema),
    requirements: z.array(deps.RequirementSchema),
    mappings: z.array(deps.ContractMappingSchema),
    candidateFindings: z.array(deps.FindingSchema),
    verifiedFindings: z.array(deps.FindingSchema),
    trajectories: z.array(deps.TrajectoryEventSchema),
    needsMoreProbes: z.boolean(),
    lastProbePurpose: z.string().optional(),
    status: z.enum(["running", "awaiting_approval", "completed", "failed"]),
    route: z.enum(["continue", "approve", "loop", "gate", "end"]),
    instructionVersion: z.string().default("v2"),
    pack: deps.ReadinessPackSchema.optional(),
  });
}

export type AgenticCheckpoint = z.infer<ReturnType<typeof buildAgenticCheckpointSchema>>;
export type AgenticObservation = z.infer<typeof AgenticObservationSchema>;

/** Bound by index.ts after core schemas exist. */
let boundSchema: ReturnType<typeof buildAgenticCheckpointSchema> | null = null;

export function bindAgenticCheckpointSchema(
  schema: ReturnType<typeof buildAgenticCheckpointSchema>
): void {
  boundSchema = schema;
}

export function getAgenticCheckpointSchema(): ReturnType<typeof buildAgenticCheckpointSchema> {
  if (!boundSchema) {
    throw new Error("AgenticCheckpointSchema not bound — import @integraguard/schemas entrypoint");
  }
  return boundSchema;
}

export function parseAgenticCheckpoint(raw: unknown): AgenticCheckpoint {
  return getAgenticCheckpointSchema().parse(raw) as AgenticCheckpoint;
}

export function safeParseAgenticCheckpoint(raw: unknown) {
  return getAgenticCheckpointSchema().safeParse(raw);
}
