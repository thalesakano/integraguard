# IntegraGuard — Improvement Changelog

> Project evolution measured on the same scenarios and ground truth whenever applicable. Deterministic and agentic metrics are reported separately because they represent different runners.

## Intended user and baseline

**Intended user:** a developer or tech lead integrating a third-party API.

**Bottleneck:** outdated documentation forces the team to discover field, response, authentication, idempotency, and pagination differences through trial and error during implementation.

**Baseline V0:** a simple generalist documentation review with, at most, one naive probe and no structured requirements, adversarial verification, or Evidence Gate.

---

## Progression

| Stage | What changed and why | Evidence | Decision / learning |
|---|---|---|---|
| **V0 — Baseline** | Used a single generalist pass to represent a reasonable basic approach. | Macro severity-weighted F1 **0.133** across 15 scenarios; unsupported claim rate **0.667**. | Established the starting point and exposed poor runtime-drift coverage. |
| **V1 — Structured requirements** | Converted goals and documentation into explicit requirements to avoid vague analysis. | Improved requirement-to-finding traceability, but runtime mismatches still could not be proven. | Kept as structured context; requirements are not evidence by themselves. |
| **V2 — Executable probes** | Added HTTP probes and a synthetic sandbox to observe actual behavior. | Began detecting undocumented fields, 404s, authentication issues, error semantics, idempotency, and pagination drift. | Kept. Observing runtime behavior produced the largest qualitative step forward. |
| **V3 — Parallel agent fan-out** | Tested parallel agents in an attempt to improve recall. | Duplicate findings, conflicting interpretations, higher orchestration cost, and no consistent recall gain. | **Removed.** More agents did not improve the result. |
| **V4 — Adversarial verification + Evidence Gate** | Required candidate findings to pass deterministic evidence checks before promotion. | Deterministic final: F1 **1.000**, unsupported claim rate **0.000** across 15 scenarios; median **125 ms/case**. | Kept as the decision boundary. This was the largest measurable contribution. |
| **V5 — Agentic contract-drift graph** | Added Docs Analyst, Probe Designer, and Result Analyst as real LangGraph nodes, with a risk router, Human Gate, checkpoint/resume, and Documented vs Observed views. | 31 test files / 111 tests; exploratory agentic-fallback F1 **0.267** across 15 scenarios, 32 ms median, 13 loops. | Kept as an investigation workflow, but it does not replace or inherit the deterministic benchmark. Separate evaluation made its limitations visible. |
| **V6 — Fail-closed and security hardening** | Fixed false READY decisions, gate composition, resume state loss, explicit correlation, URL/redirect policy, redaction boundaries, storage validation, and demo-only deployment. | New tests for gates, resume, SSRF, redaction, storage, configuration, and generated contract tests; build and all 111 tests pass. | Kept. Safety and visible uncertainty are product requirements, not optional polish. |
| **Final — Hybrid evidence-driven workflow** | Combines agents for interpretation and planning with deterministic tools, a Human Gate, and an Evidence Gate. | Full build, 8/8 build artifacts, 111 tests, deterministic benchmark, and separately provenance-stamped agentic evaluation. | Shipping candidate after final review, versioned trajectories, and green CI. |

---

## Removed experiment: V3 parallel agents

### Hypothesis

Running multiple agents in parallel would improve recall and reduce time to finding.

### What happened

- agents produced duplicate findings;
- requirement interpretations diverged;
- orchestration cost increased;
- recall did not improve consistently;
- the evidence trail became harder to follow.

### Decision

Remove parallel fan-out and keep a sequence with clear responsibilities:

```txt
Docs Analyst
→ Probe Designer
→ Risk Router / Human Gate
→ HTTP Tool
→ Result Analyst
→ Evidence Gate
```

### Learning

> Purposeful tools, verification, and human control matter more than the number of agents.

---

## Largest contribution

The largest gain did not come from a larger prompt or more agents. It came from turning hypotheses into executable observations and preventing findings without sufficient evidence from reaching the user.

```txt
LLM/agent proposes
→ tool observes
→ human controls side effects
→ deterministic gate decides
```

V4 moved the deterministic benchmark from F1 0.133 to 1.000 and reduced the unsupported candidate-claim rate from 0.667 to zero on the synthetic suite.

---

## Main failure mode discovered

A system can look more intelligent when it contains more stages or agents, but that does not mean it generalizes better. The current agentic-fallback evaluation reached F1 0.267 and missed several blockers detected by the deterministic runner.

This exposed three risks:

1. confusing agentic architecture with measured quality;
2. mixing metrics from different runners;
3. allowing an agent or gate to express certainty when evidence is incomplete.

### Project response

- deterministic and agentic metrics are reported separately;
- `INCONCLUSIVE` results and validation gaps remain visible;
- critical requirements without evidence cannot return READY;
- drift types use evidence-specific promotion predicates;
- the Human Gate runs before mutating operations;
- agentic runs include provenance;
- a deterministic fallback keeps reproduction stable.

---

## Hot Take

> **Reliable agentic systems should optimize for evidence and controlled uncertainty, not agent count.**

A workflow does not become reliable because it has more agents. It becomes reliable when every conclusion can be traced to a source, a reproducible observation, and a clear decision rule — and when the system can answer “inconclusive.”

---

## Current canonical results

### Deterministic benchmark — 15 scenarios

| Metric | V0 Baseline | V4 Final | Delta |
|---|---:|---:|---:|
| Macro severity-weighted F1 | 0.133 | **1.000** | +0.867 |
| Precision | 0.133 | **1.000** | +0.867 |
| Recall | 0.133 | **1.000** | +0.867 |
| Unsupported claim rate | 0.667 | **0.000** | -0.667 |
| Median runtime | 15 ms | 125 ms | — |
| Cost/case | $0 | $0 | — |

### Exploratory agentic fallback — 15 scenarios

| Metric | Value |
|---|---:|
| Macro severity-weighted F1 | 0.267 |
| Precision | 0.267 |
| Recall | 0.267 |
| Scenario count | 15 |
| Median runtime | 32 ms |
| Agentic loops | 13 |
| Live LLM | No; v2 nodes used deterministic fallbacks |

Do not compare these tables as if they represented the same runner.

---

## Reproduction

```powershell
pnpm.cmd eval:baseline
pnpm.cmd eval:final
pnpm.cmd eval:agentic
pnpm.cmd eval:compare v0-baseline v4-evidence-gate
pnpm.cmd exec tsx scripts/generate-eval-summary.ts --write
```

Outputs:

```txt
runs/v0-baseline/metrics.json
runs/v4-evidence-gate/metrics.json
runs/agentic-fallback/metrics.json
docs/eval-summary.md
```

Each agentic run includes mode, instruction version, timestamp, Git SHA/dirty flag, command, and fixture hash.
