# Reproduction Guide

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- Docker (for sandbox)

## Clean Environment Setup

```bash
git clone <repo-url> integraguard
cd integraguard
pnpm install
docker compose up -d
```

Verify sandbox:
```bash
curl http://localhost:4000/health
# {"status":"ok"}
```

## Run Evaluation

```bash
# Baseline V0 (generalist single-pass)
pnpm eval:baseline

# Final V4 (full workflow + evidence gate)
pnpm eval:final

# Compare metrics
pnpm eval:compare v0-baseline v4-evidence-gate
```

Results written to `runs/{experiment}/metrics.json`.

## Run Web UI

```bash
pnpm build
pnpm dev
# Open http://localhost:3000
# Select authorization-07 demo scenario → Start Analysis
# Enable LangGraph for multi-node agentic topology (default on)
```

## CLI

```bash
pnpm build
pnpm integraguard check --config integraguard.config.example.yaml --safe
# Reports: JSON / Markdown / JUnit / SARIF under integraguard-out/
```

See [docs/security-model.md](security-model.md) and [docs/llm-matrix.md](llm-matrix.md).

## Expected Results (authorization-07)

- Decision: `BLOCKED`
- ≥2 critical blockers with HTTP probe evidence
- Readiness score < 60

## Runtime & Cost

- ~3-8 seconds per scenario (no external LLM required — deterministic agents)
- 12 scenarios: ~1-2 minutes total eval run
- Sandbox: single Docker container, ~128MB RAM
