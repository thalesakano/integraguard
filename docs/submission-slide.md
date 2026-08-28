# IntegraGuard — Submission Slide

> Copy this slide into your deck (Google Slides, Canva, Pitch). One slide, hackathon judges.

---

## IntegraGuard
**Agentic API integration preflight — LLM proposes, executable evidence decides**

---

### Problem
Teams ship integrations against incomplete or wrong API docs. Production breaks on undocumented fields, false idempotency claims, and HTTP 200 with business errors.

### Solution
IntegraGuard ingests goal + docs + payloads + sandbox URL → runs specialized agents + HTTP probes → **Evidence Gate** verifies every finding → ships a **Readiness Pack** (tests, Postman, vendor email).

### Architecture
```
Docs → Requirements → Contract Mapper → Probe Planner → HTTP Probes
  → Adversarial Verifier → Evidence Gate → Readiness Pack (READY / CONDITIONAL / BLOCKED)
```

### Measured Results (12 synthetic scenarios)

| Metric | V0 Baseline | V4 Final | Δ |
|--------|-------------|----------|---|
| **Weighted F1** | 0.167 | **1.000** | **+0.833** |
| Precision | 0.167 | 1.000 | +0.833 |
| Recall | 0.167 | 1.000 | +0.833 |
| Unsupported claim rate | 0.667 | **0.000** | **−0.667** |

**12/12 scenarios at F1 1.000** after Evidence Gate + adversarial verification.

### Demo highlights
- **Human gate**: approve mutating probes before execution
- **Evidence chain**: every blocker traced to HTTP probe + doc source
- **Artifacts**: failing Vitest tests reproduce blockers; vendor email ready to send

### Reproduce in 2 minutes
```bash
pnpm install && docker compose up -d
pnpm eval:baseline && pnpm eval:final && pnpm eval:compare v0-baseline v4-evidence-gate
```

---

*IntegraGuard — don't integrate blind.*
