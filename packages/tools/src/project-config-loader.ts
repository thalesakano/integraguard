import { readFileSync } from "node:fs";
import YAML from "yaml";
import { ProjectConfigSchema, type ProjectConfig, AnalysisInputSchema, type AnalysisInput } from "@integraguard/schemas";

export function loadProjectConfig(path: string): ProjectConfig {
  const raw = readFileSync(path, "utf-8");
  const parsed = path.endsWith(".json") ? JSON.parse(raw) : YAML.parse(raw);
  return ProjectConfigSchema.parse(parsed);
}

/** Resolve credential env refs to HTTP headers — never persist these on AnalysisInput. */
export function resolveExecutionHeaders(
  refs?: { apiKeyEnv?: string; bearerTokenEnv?: string } | null
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!refs) return headers;
  if (refs.apiKeyEnv && process.env[refs.apiKeyEnv]) {
    headers["X-API-Key"] = process.env[refs.apiKeyEnv]!;
  }
  if (refs.bearerTokenEnv && process.env[refs.bearerTokenEnv]) {
    headers["Authorization"] = `Bearer ${process.env[refs.bearerTokenEnv]}`;
  }
  return headers;
}

export function resolveExecutionHeadersFromConfig(config: ProjectConfig): Record<string, string> {
  return resolveExecutionHeaders(config.credentials);
}

export function configToAnalysisInput(
  config: ProjectConfig,
  overrides?: Partial<AnalysisInput>
): AnalysisInput {
  const allowedHosts =
    config.target.allowedHosts.length > 0
      ? config.target.allowedHosts
      : [new URL(config.target.baseUrl).hostname];

  const credentialEnvRefs: AnalysisInput["credentialEnvRefs"] = {};
  if (config.credentials.apiKeyEnv) {
    credentialEnvRefs.apiKeyEnv = config.credentials.apiKeyEnv;
  }
  if (config.credentials.bearerTokenEnv) {
    credentialEnvRefs.bearerTokenEnv = config.credentials.bearerTokenEnv;
  }

  const hasInlineDocs = Boolean(config.sources.documentation?.trim());
  const documentation =
    config.sources.documentation ??
    (config.sources.docsUrl
      ? undefined
      : `# API\n\nTarget: ${config.target.baseUrl}\n\n(Provide sources.documentation or sources.docsUrl.)\n`);

  if (!hasInlineDocs && !config.sources.docsUrl && !overrides?.documentation) {
    // Still allow parse for tests that only check schema fields — CLI will call resolveConfigSources.
  }

  return AnalysisInputSchema.parse({
    goal: config.goal,
    documentation:
      overrides?.documentation ??
      documentation ??
      `# API\n\n(Unresolved docsUrl — call resolveConfigSources before check.)\n`,
    openApiSpec: overrides?.openApiSpec ?? config.sources.openApiSpec,
    sampleRequest: overrides?.sampleRequest ?? {},
    sandboxUrl: config.target.baseUrl.endsWith("/")
      ? config.target.baseUrl
      : `${config.target.baseUrl}/`,
    allowedOperations: config.target.allowedOperations,
    allowedHosts,
    maxProbes: config.policy.maxProbes,
    redactionFields: config.redaction.fields.length > 0 ? config.redaction.fields : undefined,
    credentialEnvRefs:
      credentialEnvRefs.apiKeyEnv || credentialEnvRefs.bearerTokenEnv
        ? credentialEnvRefs
        : undefined,
    targetMode: "real-api",
    ...overrides,
  });
}

/**
 * Resolve docsUrl / openApiUrl through the safe fetcher before running a check.
 * Throws if remote sources fail — never invents placeholder endpoints.
 */
export async function resolveConfigSources(config: ProjectConfig): Promise<Partial<AnalysisInput>> {
  const { loadDocumentationSource, loadOpenApiSource } = await import("./fetch-sources.js");
  const out: Partial<AnalysisInput> = {};
  const hosts = config.target.allowedHosts;

  if (config.sources.documentation?.trim()) {
    out.documentation = config.sources.documentation;
  } else if (config.sources.docsUrl) {
    const loaded = await loadDocumentationSource(config.sources.docsUrl, {
      allowedHosts: [...hosts, new URL(config.sources.docsUrl).hostname],
    });
    out.documentation = loaded.documentation;
    if (loaded.openApiSpec) out.openApiSpec = loaded.openApiSpec;
  }

  if (config.sources.openApiSpec?.trim()) {
    out.openApiSpec = config.sources.openApiSpec;
  } else if (config.sources.openApiUrl) {
    out.openApiSpec = await loadOpenApiSource(config.sources.openApiUrl, {
      allowedHosts: [...hosts, new URL(config.sources.openApiUrl).hostname],
    });
  }

  if (!out.documentation?.trim()) {
    throw new Error(
      "No documentation resolved. Set sources.documentation, sources.docsUrl, or pass --docs."
    );
  }

  return out;
}
