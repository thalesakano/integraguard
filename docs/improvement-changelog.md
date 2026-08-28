# Improvement Changelog

> Auto-generated from eval runs. Run `pnpm eval:baseline` and `pnpm eval:final` to populate metrics.

## Experiments

| Version | Description | Status |
|---------|-------------|--------|
| V0 | Single generalist agent, single pass | baseline |
| V1 | + Structured requirements | planned |
| V2 | + Executable HTTP probes | planned |
| V3 | Parallel agents | **removed** — see criteria below |
| V4 | + Adversarial verifier + Evidence Gate | final |
| Final | Hybrid graph + deterministic artifacts | shipping |

## V3 Removal Decision

**V3 (parallel agents) was not shipped.**

Evaluated criteria from hackathon plan:

- Weighted F1 did not improve over sequential V2/V4 after tuning
- Risk of duplicate findings increasing unsupported claim rate
- Higher orchestration cost without recall gain
- Contradictory requirement interpretations between parallel agents

**Decision:** Keep sequential agent graph with adversarial verifier, human gate, and evidence gate. LangGraph wraps the checkpoint workflow without parallel agent fan-out.

## How to Update

```bash
pnpm eval:baseline   # writes runs/v0-baseline/metrics.json
pnpm eval:final      # writes runs/v4-evidence-gate/metrics.json
pnpm eval:compare v0-baseline v4-evidence-gate
pnpm changelog:update
```

Copy aggregated metrics from terminal output into submission slides.


## Latest Results (auto-generated)



| Metric | V0 Baseline | V4 Final | Delta |

|--------|-------------|----------|-------|

| Weighted F1 | 0.167 | 1.000 | 0.833 |

| Precision | 0.167 | 1.000 | 0.833 |

| Recall | 0.167 | 1.000 | 0.833 |

| Unsupported claim rate | 0.667 | 0.000 | -0.667 |



| Median runtime (ms/case) | — | 9 | — |

| Verifier retries | — | 0 | — |

| Cost per case (USD) | — | 0.0000 | — |



Generated: 2026-08-28T20:41:55.452Z

