# Product Workflow — Contract Drift

## Positioning

IntegraGuard compares **documented expectations** with **observed behavior**, detects **contract drift**, and produces reproducible evidence — not opinions.

## Vocabulary

| Term | Meaning |
|------|---------|
| Documented Expectation | Claim extracted from docs/OpenAPI with source citation |
| Observed Behavior | Redacted HTTP probe result |
| Contract Drift | Verified mismatch between expectation and observation |
| Validation Gap | Inconclusive — needs more probes or vendor input |
| Agent suggestion | LLM/heuristic proposal (never final verdict) |
| Tool observation | Deterministic crawl/probe/diff output |
| Human approval | Required for mutating probes |
| Deterministic decision | Evidence Gate / probe policy |

## Pipeline

```
ingest → docs analyst → normalize contract → probe designer
  → risk router (human gate if mutating)
  → execute probe → result analyst
  → (optional loop) → evidence gate → artifacts
```

## Modes

- **Deterministic pipeline**: `runIntegraGuardWorkflow` — stable for eval
- **Agentic LangGraph**: UI checkbox / `--agentic` — real multi-node graph (`INTEGRAGUARD_AGENTIC=0` → legacy wrapper)
- **LLM enrich**: optional `--llm` / UI when `OPENAI_API_KEY` is set; Evidence Gate still decides
- **Sandbox / Custom / Docs URL / Real API**: same gate, different ingestion

## Holdouts

Non-authorization scenarios prove the core is not tied to pre-auth field names:

- `orders-01` — undocumented required field
- `payments-01` — business error inside HTTP 200
- `catalog-01` — pagination contract mismatch
