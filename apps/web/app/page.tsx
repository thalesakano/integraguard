"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MetricsDashboard } from "@/app/components/MetricsDashboard";

type InputMode = "scenario" | "custom" | "real-api";

const SCENARIO_LABELS: Record<string, string> = {
  "authorization-01": "Correct contract",
  "authorization-02": "Claims API (correct)",
  "authorization-03": "Schema divergent",
  "authorization-04": "Undocumented required field",
  "authorization-05": "Auth divergent",
  "authorization-06": "HTTP 200 + business error",
  "authorization-07": "Demo: Multi-blocker",
  "authorization-08": "Endpoint not found",
  "authorization-09": "Pagination inconsistent",
  "authorization-10": "Missing idempotency",
  "authorization-11": "Rate limit undocumented",
  "authorization-12": "Hard multi-blocker",
};

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [scenarios, setScenarios] = useState<string[]>([]);
  const [mode, setMode] = useState<InputMode>("scenario");
  const [scenarioId, setScenarioId] = useState("authorization-07");
  const [goal, setGoal] = useState("Submit and query pre-authorization requests for medical procedures");
  const [documentation, setDocumentation] = useState("");
  const [openApiSpec, setOpenApiSpec] = useState("");
  const [sampleRequest, setSampleRequest] = useState("{}");
  const [sampleResponse, setSampleResponse] = useState("");
  const [sandboxUrl, setSandboxUrl] = useState("http://localhost:4000/scenarios/authorization-07/");
  const [allowedGet, setAllowedGet] = useState(true);
  const [allowedPost, setAllowedPost] = useState(true);
  const [autoApproveProbes, setAutoApproveProbes] = useState(false);
  const [useLangGraph, setUseLangGraph] = useState(true);
  const [useLlm, setUseLlm] = useState(false);
  const [llmAvailable, setLlmAvailable] = useState(false);
  const [openApiUrl, setOpenApiUrl] = useState("");
  const [fetchingOpenApi, setFetchingOpenApi] = useState(false);
  const [metrics, setMetrics] = useState<{
    available: boolean;
    baseline?: { weightedF1: number; unsupportedClaimRate: number; precision: number; recall: number };
    final?: { weightedF1: number; unsupportedClaimRate: number; precision: number; recall: number };
    operational?: { medianRuntimeMs: number; totalRuntimeMs: number; totalVerifierRetries: number; costPerCaseUsd: number; scenarioCount: number };
    caseResults?: { caseId: string; f1: number; runtimeMs?: number }[];
  } | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);

  useEffect(() => {
    fetch("/api/llm-status")
      .then((r) => r.json())
      .then((d) => setLlmAvailable(Boolean(d.available)))
      .catch(() => setLlmAvailable(false));
    fetch("/api/metrics")
      .then((r) => r.json())
      .then(setMetrics)
      .catch(() => setMetrics({ available: false }));
  }, []);

  useEffect(() => {
    fetch("/api/scenarios")
      .then((r) => r.json())
      .then((data) => {
        if (data.scenarios?.length) setScenarios(data.scenarios);
        else setScenarios(Object.keys(SCENARIO_LABELS));
      })
      .catch(() => setScenarios(Object.keys(SCENARIO_LABELS)));
  }, []);

  useEffect(() => {
    if (mode !== "scenario" || !scenarioId) return;
    loadScenario(scenarioId);
  }, [scenarioId, mode]);

  async function loadScenario(id: string) {
    const res = await fetch(`/api/scenarios/${id}`);
    if (!res.ok) return null;
    const scenario = await res.json();
    setDocumentation(scenario.documentation ?? "");
    setOpenApiSpec(scenario.openApiSpec ?? "");
    setSampleRequest(JSON.stringify(scenario.sampleRequest ?? {}, null, 2));
    setSampleResponse(
      scenario.sampleResponse ? JSON.stringify(scenario.sampleResponse, null, 2) : ""
    );
    setSandboxUrl(`http://localhost:4000/scenarios/${id}/`);
    return scenario as {
      documentation: string;
      openApiSpec?: string;
      sampleRequest: unknown;
      sampleResponse?: unknown;
    };
  }

  async function submitAnalysisPayload(payload: {
    goal: string;
    documentation: string;
    openApiSpec?: string;
    sampleRequest: unknown;
    sampleResponse?: unknown;
    sandboxUrl: string;
    scenarioId?: string;
    targetMode: InputMode | "sandbox" | "custom";
    autoApproveProbes: boolean;
  }) {
    const allowedOperations = [
      ...(allowedGet ? ["GET"] : []),
      ...(allowedPost ? ["POST"] : []),
    ];
    if (allowedOperations.length === 0) {
      throw new Error("Select at least one allowed operation");
    }

    const res = await fetch("/api/analyses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal: payload.goal,
        documentation: payload.documentation,
        openApiSpec: payload.openApiSpec,
        sampleRequest: payload.sampleRequest,
        sampleResponse: payload.sampleResponse,
        sandboxUrl: payload.sandboxUrl.replace(/\/+$/, "") + "/",
        scenarioId: payload.scenarioId,
        targetMode:
          payload.targetMode === "real-api"
            ? "real-api"
            : payload.targetMode === "scenario"
              ? "sandbox"
              : "custom",
        allowedOperations,
        autoApproveProbes: payload.autoApproveProbes,
        useLangGraph,
        useLlm: useLlm && llmAvailable,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? data.error ?? "Failed to start analysis");
    return data.id as string;
  }

  async function submitAnalysis(overrides?: { autoApprove?: boolean }) {
    return submitAnalysisPayload({
      goal,
      documentation,
      openApiSpec: openApiSpec.trim() || undefined,
      sampleRequest: parseJsonField(sampleRequest, "Sample Request"),
      sampleResponse: sampleResponse.trim()
        ? parseJsonField(sampleResponse, "Sample Response")
        : undefined,
      sandboxUrl,
      scenarioId: mode === "scenario" ? scenarioId : undefined,
      targetMode: mode,
      autoApproveProbes: overrides?.autoApprove ?? autoApproveProbes,
    });
  }

  async function runHackathonDemo() {
    setDemoLoading(true);
    try {
      setMode("scenario");
      setScenarioId("authorization-07");
      setAutoApproveProbes(false);
      setUseLangGraph(true);
      const scenario = await loadScenario("authorization-07");
      if (!scenario) throw new Error("Failed to load demo scenario");
      const runId = await submitAnalysisPayload({
        goal: "Submit and query pre-authorization requests for medical procedures",
        documentation: scenario.documentation,
        openApiSpec: scenario.openApiSpec,
        sampleRequest: scenario.sampleRequest,
        sampleResponse: scenario.sampleResponse,
        sandboxUrl: "http://localhost:4000/scenarios/authorization-07/",
        scenarioId: "authorization-07",
        targetMode: "scenario",
        autoApproveProbes: false,
      });
      router.push(`/runs/${runId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Demo failed to start");
    } finally {
      setDemoLoading(false);
    }
  }

  function parseJsonField(value: string, fieldName: string): unknown {
    if (!value.trim()) return undefined;
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`Invalid JSON in ${fieldName}`);
    }
  }

  async function fetchOpenApiFromUrl() {
    if (!openApiUrl.trim()) return;
    setFetchingOpenApi(true);
    try {
      const res = await fetch("/api/fetch-openapi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: openApiUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch OpenAPI");
      setOpenApiSpec(data.spec ?? "");
      if (data.description && !documentation.trim()) {
        setDocumentation(`# ${data.title ?? "API"}\n\n${data.description}`);
      }
      if (mode === "real-api") {
        try {
          const origin = new URL(openApiUrl.trim()).origin;
          setSandboxUrl(`${origin}/`);
        } catch {
          /* keep current URL */
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to fetch OpenAPI");
    } finally {
      setFetchingOpenApi(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const id = await submitAnalysis();
      router.push(`/runs/${id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to start analysis");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <section className="card mb-8 border-[var(--accent)]/30 bg-gradient-to-br from-[var(--surface)] to-[var(--bg)]">
        <p className="text-xs uppercase tracking-wider text-[var(--accent)] mb-2">API Integration Preflight</p>
        <h2 className="text-3xl font-bold mb-3 leading-tight">
          Your docs say X. The API responds Y.<br />
          <span className="text-[var(--muted)] font-normal text-xl">Prove it before you integrate.</span>
        </h2>
        <p className="text-[var(--muted)] max-w-2xl mb-4">
          For developers and tech leads integrating third-party APIs. IntegraGuard ingests goal + documentation +
          payloads, runs agentic HTTP probes, and delivers a{" "}
          <strong className="text-[var(--text)]">Readiness Pack</strong> —{" "}
          <span className="status-READY">READY</span> /{" "}
          <span className="status-CONDITIONAL">CONDITIONAL</span> /{" "}
          <span className="status-BLOCKED">BLOCKED</span> — with executable tests and vendor-ready questions.
        </p>
        <p className="text-sm text-[var(--accent)] mb-5 italic">
          LLM proposes hypotheses. Executable evidence decides.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={runHackathonDemo}
            disabled={demoLoading || loading}
            className="bg-[var(--accent)] hover:opacity-90 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-medium text-sm"
          >
            {demoLoading ? "Starting demo..." : "Run hackathon demo (authorization-07)"}
          </button>
          <a
            href="#create-analysis"
            className="px-5 py-2.5 rounded-lg text-sm font-medium border border-[var(--border)] hover:border-[var(--accent)]"
          >
            Custom analysis ↓
          </a>
        </div>
      </section>

      {metrics && (
        <section className="card mb-8">
          <h3 className="font-medium mb-1">Measured Improvement</h3>
          <p className="text-xs text-[var(--muted)] mb-4">
            12 synthetic scenarios · ground truth hidden from agents · CI runs eval on every push
          </p>
          <MetricsDashboard metrics={metrics} />
        </section>
      )}

      <section id="create-analysis">
      <h2 className="text-2xl font-semibold mb-2">Create Analysis</h2>
      <p className="text-[var(--muted)] mb-6">
        Provide integration goal, documentation, sample payloads, and sandbox URL.
        IntegraGuard will produce an evidence-grounded readiness pack.
      </p>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setMode("scenario")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            mode === "scenario" ? "bg-[var(--accent)] text-white" : "bg-[var(--surface)] border border-[var(--border)]"
          }`}
        >
          Scenario template
        </button>
        <button
          type="button"
          onClick={() => setMode("custom")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            mode === "custom" ? "bg-[var(--accent)] text-white" : "bg-[var(--surface)] border border-[var(--border)]"
          }`}
        >
          Custom input
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("real-api");
            setSandboxUrl("");
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            mode === "real-api" ? "bg-[var(--accent)] text-white" : "bg-[var(--surface)] border border-[var(--border)]"
          }`}
        >
          Real API
        </button>
      </div>

      {mode === "real-api" && (
        <div className="mb-4 p-4 rounded-lg border border-[var(--danger)] bg-[var(--danger)]/10 text-sm">
          <strong className="text-[var(--danger)]">Real API mode</strong> sends live HTTP probes to your
          target URL. Use a staging environment only. Enable Human gate to approve mutating requests.
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-4">
        {mode === "scenario" && (
          <div>
            <label className="block text-sm font-medium mb-1">
              Scenario template ({scenarios.length} available)
            </label>
            <select
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2"
              value={scenarioId}
              onChange={(e) => setScenarioId(e.target.value)}
            >
              {scenarios.map((id) => (
                <option key={id} value={id}>
                  {SCENARIO_LABELS[id] ?? id} ({id})
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--muted)] mt-1">
              Loads docs and payloads below — you can edit before running.
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Integration Goal</label>
          <textarea
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 min-h-[80px]"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">API Documentation (Markdown)</label>
          <textarea
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 min-h-[160px] font-mono text-sm"
            value={documentation}
            onChange={(e) => setDocumentation(e.target.value)}
            placeholder="# API Docs&#10;&#10;POST /v1/..."
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">OpenAPI Spec (optional)</label>
          {(mode === "real-api" || mode === "custom") && (
            <div className="flex gap-2 mb-2">
              <input
                className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 font-mono text-sm"
                value={openApiUrl}
                onChange={(e) => setOpenApiUrl(e.target.value)}
                placeholder="https://api.example.com/openapi.json"
              />
              <button
                type="button"
                onClick={fetchOpenApiFromUrl}
                disabled={fetchingOpenApi || !openApiUrl.trim()}
                className="px-4 py-2 rounded-lg text-sm bg-[var(--surface)] border border-[var(--border)] disabled:opacity-50"
              >
                {fetchingOpenApi ? "Fetching..." : "Fetch spec"}
              </button>
            </div>
          )}
          <textarea
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 min-h-[120px] font-mono text-sm"
            value={openApiSpec}
            onChange={(e) => setOpenApiSpec(e.target.value)}
            placeholder="openapi: 3.0.0..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Sample Request (JSON)</label>
            <textarea
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 min-h-[120px] font-mono text-sm"
              value={sampleRequest}
              onChange={(e) => setSampleRequest(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Sample Response (JSON, optional)</label>
            <textarea
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 min-h-[120px] font-mono text-sm"
              value={sampleResponse}
              onChange={(e) => setSampleResponse(e.target.value)}
              placeholder="{}"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            {mode === "real-api" ? "API Base URL" : "Sandbox URL"}
          </label>
          <input
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 font-mono text-sm"
            value={sandboxUrl}
            onChange={(e) => setSandboxUrl(e.target.value)}
            placeholder={
              mode === "real-api"
                ? "https://staging-api.example.com/"
                : "http://localhost:4000/scenarios/authorization-07/"
            }
            required
          />
          <p className="text-xs text-[var(--muted)] mt-1">
            {mode === "real-api"
              ? "Base URL for HTTP probes (staging recommended). Trailing slash optional."
              : "Local sandbox: http://localhost:4000/scenarios/<scenario-id>/"}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Allowed Operations</label>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={allowedGet}
                onChange={(e) => setAllowedGet(e.target.checked)}
              />
              GET
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={allowedPost}
                onChange={(e) => setAllowedPost(e.target.checked)}
              />
              POST
            </label>
          </div>
        </div>

        <div className="border-t border-[var(--border)] pt-4 space-y-3">
          <p className="text-sm font-medium">Workflow options</p>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={!autoApproveProbes}
              onChange={(e) => setAutoApproveProbes(!e.target.checked)}
              className="mt-1"
            />
            <span>
              <strong>Human gate</strong> — require approval before mutating HTTP probes (recommended for demo)
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={useLangGraph}
              onChange={(e) => setUseLangGraph(e.target.checked)}
            />
            Run via LangGraph orchestrator
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={useLlm}
              onChange={(e) => setUseLlm(e.target.checked)}
              disabled={!llmAvailable}
              className="mt-1"
            />
            <span>
              <strong>Use LLM</strong> for requirement hypotheses{" "}
              {llmAvailable ? (
                <span className="text-[var(--muted)]">(Evidence Gate still decides)</span>
              ) : (
                <span className="text-[var(--muted)]">— set OPENAI_API_KEY in .env.local</span>
              )}
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-[var(--accent)] hover:opacity-90 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium"
        >
          {loading ? "Starting workflow..." : "Start Analysis"}
        </button>
      </form>
      </section>
    </div>
  );
}
