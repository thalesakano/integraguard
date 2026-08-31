# LLM matrix results

Generated: 2026-08-29T14:44:58.188Z

| Mode | Model | Instruction | Latency (ms) | Decision | Verified drifts | Label |
|------|-------|-------------|--------------|----------|-----------------|-------|
| deterministic | none | v1 | 39 | BLOCKED | 1 | `deterministic` |
| agentic-fallback | none | v2 | 39 | CONDITIONAL | 1 | `agentic-fallback` |
| agentic-llm | skipped | n/a | 0 | — | 0 | `agentic-llm` |
| replay | none | v1 | 0 | BLOCKED | 1 | `replay` |

## Notes

- **deterministic**: Fixed heuristics + Evidence Gate
- **agentic-fallback**: LangGraph nodes + deterministic agent bodies
- **agentic-llm**: Skipped — OPENAI_API_KEY not set
- **replay**: Offline replay — not a live model call

Replay is labeled offline and must never be presented as a live LLM call.
