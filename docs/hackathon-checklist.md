# Hackathon Submission Checklist

> micro1 First Hackathon — map each criterion to evidence in this repo.

## Problem & User Value (15 pts)

| Evidence | Location |
|----------|----------|
| Problem statement | Landing hero on `/` |
| User persona (dev/tech lead integrating 3rd-party APIs) | `docs/demo-script.md`, README |
| Real bottleneck (fragmented docs vs API behavior) | `docs/architecture.md` |
| Demo scenario inspired by real pain (pre-auth) | `scenarios/authorization-07/` |

## Agent Solution & Engineering (30 pts)

| Evidence | Location |
|----------|----------|
| 4 specialized agents | `packages/agents/src/` |
| Versioned prompts | `packages/agents/prompts/v1/` |
| HTTP tools (probes, OpenAPI, validation) | `packages/tools/` |
| Adversarial verifier + max retries | `packages/agents/src/adversarial-verifier.ts` |
| Evidence Gate (deterministic) | `packages/workflow/src/evidence-gate.ts` |
| Human gate (approve probes) | UI Live Workflow + `approve-probe` API |
| LangGraph orchestrator | `packages/workflow/src/langgraph-workflow.ts` |
| Typed state + trajectories | `packages/schemas/`, trajectory JSON in runs |

## End-to-End Quality (20 pts)

| Evidence | Location |
|----------|----------|
| 3 UI screens | `/`, `/runs/[id]`, `/runs/[id]/pack` |
| Readiness Pack (READY/CONDITIONAL/BLOCKED) | Readiness Pack page |
| Executable artifacts in ZIP | Download ZIP — tests, Postman, TS client, vendor email |
| Evidence chain visualization | Readiness Pack → Evidence Chain panel |
| One-click demo | **Run hackathon demo** button on landing |

## Measured Improvement (15 pts)

| Evidence | Location |
|----------|----------|
| Baseline V0 (fair comparison) | `packages/evaluator/src/baseline-v0.ts` |
| 12 scenarios + ground truth | `scenarios/*/ground-truth.yaml` |
| Weighted F1 metric | `packages/evaluator/src/metrics.ts` |
| Baseline vs final numbers | `runs/v0-baseline/metrics.json`, `runs/v4-evidence-gate/metrics.json` |
| UI metrics dashboard | Landing + Readiness Pack |
| Improvement changelog | `docs/improvement-changelog.md` |
| V3 removal documented | Changelog — V3 Removal Criteria |

## Reproducibility (15 pts)

| Evidence | Location |
|----------|----------|
| Docker sandbox | `docker compose up -d` |
| Single-command eval | `pnpm eval:baseline && pnpm eval:final` |
| Reproduction guide | `docs/reproduction.md` |
| CI pipeline | `.github/workflows/eval.yml` |
| Pinned pnpm version | `package.json` → `packageManager` |
| Synthetic data only | `scenarios/`, `sandbox/` |
| Committed metrics JSON | `runs/*/metrics.json` (judges see numbers without running) |

## Hot Take (5 pts)

| Evidence | Location |
|----------|----------|
| Thesis: "LLM proposes; executable evidence decides" | README, architecture.md, landing |
| Optional LLM (not required for correctness) | `packages/agents/src/llm-client.ts`, UI toggle |
| Unsupported claim rate → 0 | metrics.json |

---

## Submission assets

- [ ] Public GitHub repo
- [ ] README with screenshots + quick start
- [ ] 5-min demo video (follow `docs/demo-script.md`)
- [ ] Slide: `docs/submission-slide.md`
- [ ] CI green on main branch
- [ ] No secrets in repo (`.env.local` gitignored)

## Commands for judges (copy-paste)

```bash
git clone <repo-url> integraguard && cd integraguard
pnpm install
docker compose up -d
pnpm eval:baseline
pnpm eval:final
pnpm eval:compare v0-baseline v4-evidence-gate
pnpm dev   # optional UI at :3000
```

Expected: **Weighted F1 ≥ 0.85**, final typically **1.000** on all 12 scenarios.
