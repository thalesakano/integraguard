# Dependency advisory triage

Last reviewed: 2026-08-29 via `pnpm audit --prod` (after `pnpm.overrides.langsmith>=0.6.0`).

## Summary

| Severity | Count (prod) | Disposition |
|----------|--------------|-------------|
| Critical | 1 | Accepted — false positive on workspace package name `sandbox` |
| High | 2 | Documented; langsmith upgraded via override when possible |
| Moderate | 5 | Accepted for hackathon with scope notes |

## Critical: `sandbox` (GHSA-gc25-3vc5-2jf9 / GHSA-fm4j-4xhm-xpwx)

**Package name collision.** npm advisory targets the unrelated published `sandbox` package (browser/OS sandbox escape). This monorepo’s `@integraguard/sandbox` is a **private Fastify fixture** (`sandbox/package.json` name `@integraguard/sandbox`) used only for local/CI synthetic APIs. There is no dependency path to the vulnerable public `sandbox` npm package.

**Action:** Accepted as non-applicable. Do not rename mid-hackathon unless judges require it.

## High: `langsmith` (via `@langchain/langgraph`)

Affects prompt-pull deserialization / SSRF in LangSmith client when talking to LangSmith cloud. IntegraGuard uses LangGraph **locally** for topology; we do not pull public LangSmith prompts in the default deterministic path.

**Action:** `pnpm.overrides.langsmith: ">=0.6.0"` applied at repo root. Re-run `pnpm audit --prod` after lockfile refresh. Residual LangChain chain risk accepted for local-only graph use; public deploy stays demo/replay-only.

## High/Moderate: `postcss` (via `next`)

Build-time tooling in Next.js. Not on the IntegraGuard probe/crawler trust boundary.

**Action:** Track Next.js patch releases; no blind major bump on submission day.

## Moderate: `uuid` (via langgraph-sdk)

Transitive; not used for security tokens in IntegraGuard.

## Residual risk for public demo

Public deploy must use `INTEGRAGUARD_DEMO_MODE=1` (no arbitrary egress). See [security-model.md](security-model.md).

## Re-check

```bash
pnpm audit --prod
pnpm build
pnpm test
```
