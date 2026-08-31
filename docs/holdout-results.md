# Holdout results (Task 21)

Evaluated against local sandbox (`pnpm --filter @integraguard/sandbox start`) with deterministic final pipeline.

| Scenario | Drift type | Decision | Weighted F1 | Detected |
|----------|------------|----------|-------------|----------|
| orders-01 | undocumented required field (`sku`) | BLOCKED | 1.000 | yes |
| payments-01 | business error inside HTTP 200 | BLOCKED | 1.000 | yes |
| catalog-01 | pagination page vs cursor | CONDITIONAL | 1.000 | yes |

**Acceptance:** ≥2/3 drifts detected — **3/3**. Zero promotion without type-specific evidence (Evidence Gate). Inconclusives remain visible as CONDITIONAL/unanswered when applicable.

Re-run:

```bash
pnpm --filter @integraguard/sandbox start
pnpm eval:final --scenario=orders-01
pnpm eval:final --scenario=payments-01
pnpm eval:final --scenario=catalog-01
```

Note: single-scenario `eval:final` overwrites `runs/v4-evidence-gate/metrics.json`. Prefer writing holdout-only results here or use a dedicated `EXPERIMENT=holdouts` env when measuring.
