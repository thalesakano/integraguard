import { z } from "zod";

export const ProjectConfigSchema = z.object({
  version: z.number().int().default(1),
  goal: z.string(),
  sources: z
    .object({
      docsUrl: z.string().url().optional(),
      openApiUrl: z.string().url().optional(),
      documentation: z.string().optional(),
      openApiSpec: z.string().optional(),
    })
    .default({}),
  target: z.object({
    baseUrl: z.string().url(),
    allowedHosts: z.array(z.string()).default([]),
    allowedOperations: z.array(z.string()).default(["GET", "POST"]),
  }),
  policy: z
    .object({
      autoApprove: z.array(z.string()).default(["GET"]),
      maxProbes: z.number().int().positive().default(8),
      timeoutMs: z.number().int().positive().default(10_000),
      autoApproveProbes: z.boolean().default(false),
    })
    .default({}),
  redaction: z
    .object({
      fields: z.array(z.string()).default([]),
    })
    .default({}),
  /** Env var *names* for secrets — never store secret values in YAML */
  credentials: z
    .object({
      apiKeyEnv: z.string().optional(),
      bearerTokenEnv: z.string().optional(),
    })
    .default({}),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
