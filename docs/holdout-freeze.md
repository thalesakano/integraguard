# Holdout freeze (Task 26)

Holdout scenarios are frozen for fair generalization claims:

| ID | Intent | Frozen |
|----|--------|--------|
| orders-01 | undocumented required field | yes |
| payments-01 | business error in HTTP 200 | yes |
| catalog-01 | pagination page vs cursor | yes |

**Rules:**
- Do not add case-specific heuristics to agents/core keyed on these scenario IDs.
- Sandbox handlers may encode the drift; detection must stay generic.
- Report holdout metrics separately from the authorization suite when claiming generalization.
- Prefer `EXPERIMENT=holdouts` or `docs/holdout-results.md` rather than overwriting V4 suite metrics with a single scenario.
