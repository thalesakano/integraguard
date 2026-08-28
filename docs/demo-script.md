# IntegraGuard — Demo Script (5 min)

> Roteiro para gravação do vídeo de submissão (micro1 First Hackathon).
> Pré-requisitos: `docker compose up -d`, `pnpm dev`, terminal separado pronto.

---

## Setup antes de gravar

```bash
docker compose up -d
pnpm dev                    # http://localhost:3000
pnpm eval:baseline          # terminal 2 — para segmento de reprodução
pnpm eval:final
```

Cenário demo: **authorization-07** · Human gate **ON** · LangGraph **ON**

---

## 0:00–0:30 — Problema

**Fala sugerida:**

> "Developers lose days integrating third-party APIs. Documentation says one thing — beneficiaryCard, HTTP 4xx for errors, idempotency guaranteed — but the real API expects beneficiary_id, returns HTTP 200 with businessStatus error, and creates duplicates anyway.
>
> IntegraGuard answers one question: **can we start this integration now?** READY, CONDITIONAL, or BLOCKED — with executable proof."

**Tela:** Landing page → hero IntegraGuard

---

## 0:30–1:00 — Baseline

**Fala:**

> "Our V0 baseline is a single generalist agent — same docs, no structured workflow, no evidence gate. It misses blockers and makes unsupported claims."

**Tela:** Terminal — mostrar output resumido:

```
pnpm eval:compare v0-baseline v4-evidence-gate
# Weighted F1: 0.167 → 1.000
# Unsupported claim rate: 0.667 → 0.000
```

Ou abrir `runs/v0-baseline/metrics.json` se preferir.

---

## 1:00–2:30 — Workflow ao vivo

**Fala:**

> "IntegraGuard runs four specialized agents plus an adversarial verifier and evidence gate. LLM can propose hypotheses — but **executable evidence decides**."

**Ações:**

1. Clicar **Run hackathon demo** (ou Create Analysis → authorization-07)
2. Confirmar **Human gate** ativado
3. **Start Analysis**
4. Live Workflow: mostrar graph (requirements → mapper → probes → verifier → gate)
5. Quando aparecer probe pendente → **Approve**
6. Mostrar trajectory: HTTP 400 beneficiary_id, HTTP 200 business error

---

## 2:30–3:20 — Readiness Pack

**Fala:**

> "Result: BLOCKED. Three verified blockers — each with an evidence chain from doc to HTTP probe to failing contract test."

**Ações:**

1. Abrir **Readiness Pack**
2. Mostrar status BLOCKED + score
3. Scroll **Evidence Chain** — um blocker completo
4. **Download ZIP**
5. Mencionar artefatos: `contract.test.ts`, `vendor-clarification-email.md`, `typescript-client.ts`

---

## 3:20–4:10 — Métricas

**Fala:**

> "We evaluated 12 synthetic scenarios with ground truth the agents never see. Weighted F1 went from 0.167 to 1.000. All 12 scenarios at perfect F1. Zero unsupported claims. Median runtime under 10 seconds per case, zero dollar cost in deterministic mode."

**Tela:** Tabela Baseline vs Final + grid 12/12 na UI · terminal com operational metrics

---

## 4:10–4:40 — Changelog & experimento removido

**Fala:**

> "The biggest gain came from V4: adversarial verifier plus evidence gate — plus0.833 F1.
>
> We tried V3 parallel agents but removed it: duplicate findings, higher cost, no recall gain. Sequential graph with human gate won."

**Tela:** `docs/improvement-changelog.md` — seção V3 Removal Criteria

---

## 4:40–5:00 — Reprodução

**Fala:**

> "Clone the repo, docker compose up, two commands — and you get the same numbers."

**Tela:** Terminal limpo:

```bash
git clone <repo-url> && cd integraguard
pnpm install && docker compose up -d
pnpm eval:baseline && pnpm eval:final && pnpm eval:compare v0-baseline v4-evidence-gate
```

Mostrar CI badge no README (GitHub Actions).

**Fechamento:**

> "IntegraGuard — don't integrate blind. Every claim needs evidence. Every blocker becomes a test."

---

## Checklist pós-gravação

- [ ] Legendas em inglês (juízes internacionais)
- [ ] Áudio claro, sem ruído
- [ ] Mostrar URL do repo na descrição
- [ ] Link para `docs/reproduction.md` na submissão
