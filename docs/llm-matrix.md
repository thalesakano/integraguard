# LLM / pipeline matrix

Prove agent value without losing reproducibility. Label every run.

| Mode | How | LLM live? | Label in UI / artifacts |
|------|-----|-----------|-------------------------|
| Deterministic | `runIntegraGuardWorkflow` / CLI default | No | `deterministic` |
| Agentic + heuristics | `--agentic` without `--llm`, or LangGraph UI with LLM off | No | `agentic-fallback` |
| Agentic + LLM | `--agentic --llm` / UI LangGraph + LLM | Yes | `agentic-llm` + model id |
| Replay | `integraguard replay <run.json>` | No | `replay` (never “live”) |

## What to record

- `mode`, `model` (or `none`), `instructionVersion` (e.g. `v2`)
- latency, token/cost estimates when LLM used
- decision, verified drifts, unsupported claim rate
- whether Evidence Gate rejected any candidate

## Acceptance

1. Deterministic and agentic-fallback stay bit-stable for the same scenario fixture.
2. LLM mode may change probe order/hypotheses; verified findings still require type-specific evidence.
3. Replay output is tagged `replay` and does not claim a live model call.

## Run

```bash
pnpm eval:matrix          # prints table + writes runs/llm-matrix/
pnpm eval:matrix --write  # also writes docs/llm-matrix-results.md
```

Latest recorded table: [llm-matrix-results.md](llm-matrix-results.md).
