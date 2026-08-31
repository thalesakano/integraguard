import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { GroundTruthSchema, AnalysisInputSchema, type AnalysisInput, type GroundTruth } from "@integraguard/schemas";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SCENARIOS_ROOT = join(__dirname, "..", "scenarios");

export interface ScenarioBundle {
  id: string;
  groundTruth: GroundTruth;
  input: AnalysisInput;
  docsPath: string;
}

function loadScenario(id: string): ScenarioBundle {
  const dir = join(SCENARIOS_ROOT, id);
  const groundTruth = GroundTruthSchema.parse(
    YAML.parse(readFileSync(join(dir, "ground-truth.yaml"), "utf-8"))
  );
  const documentation = readFileSync(join(dir, "api-docs.md"), "utf-8");
  const openApiSpec = existsSync(join(dir, "openapi.yaml"))
    ? readFileSync(join(dir, "openapi.yaml"), "utf-8")
    : undefined;
  const sampleRequest = JSON.parse(readFileSync(join(dir, "sample-request.json"), "utf-8"));
  const sampleResponse = existsSync(join(dir, "sample-response.json"))
    ? JSON.parse(readFileSync(join(dir, "sample-response.json"), "utf-8"))
    : undefined;

  const sandboxBase = process.env.SANDBOX_URL ?? "http://localhost:4000";
  const goal = groundTruth.case.includes("claims")
    ? "Submit a medical claim"
    : groundTruth.case.includes("orders")
      ? "Create and query customer orders"
      : groundTruth.case.includes("payments")
        ? "Submit a payment"
        : groundTruth.case.includes("catalog")
          ? "List catalog resources with pagination"
          : "Submit and query pre-authorization requests for medical procedures";

  const input = AnalysisInputSchema.parse({
    goal,
    documentation,
    openApiSpec,
    sampleRequest,
    sampleResponse,
    sandboxUrl: `${sandboxBase}/scenarios/${id}/`,
    scenarioId: id,
    allowedOperations: ["GET", "POST"],
  });

  return { id, groundTruth, input, docsPath: join(dir, "api-docs.md") };
}

export function listScenarioIds(): string[] {
  if (!existsSync(SCENARIOS_ROOT)) return [];
  return readdirSync(SCENARIOS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

export function loadAllScenarios(): ScenarioBundle[] {
  return listScenarioIds().map(loadScenario);
}

export function loadScenarioById(id: string): ScenarioBundle {
  return loadScenario(id);
}
