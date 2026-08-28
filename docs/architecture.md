# Architecture

## Overview

IntegraGuard is an agentic preflight system for third-party API integrations. It accepts integration goals, documentation, sample payloads, and a sandbox URL, then produces an **Integration Readiness Pack** with evidence-grounded findings.

## Core Principle

> LLM proposes; executable evidence decides.

Findings only reach the final report when the **Evidence Gate** validates them with linked document and/or HTTP probe evidence.

## Agent Pipeline

1. **Context Builder** — indexes documentation sections
2. **Requirements Agent** — structures acceptance criteria (does not judge API behavior)
3. **Contract Mapper** — maps requirements to endpoints with source references
4. **Probe Planner** — plans minimal HTTP probes with side-effect risk labels
5. **Sandbox HTTP Tools** — executes controlled probes against synthetic APIs
6. **Adversarial Verifier** — challenges findings, requests additional probes (max 2 retries)
7. **Evidence Gate** — deterministic promotion/rejection of findings

## Evidence Gate Rules

- Finding requires ≥1 valid evidence
- Runtime blockers require `http_probe` evidence
- Duplicates merged by requirement + blocker type
- Decision: `BLOCKED` (critical) | `CONDITIONAL` (major) | `READY`

## Evaluation

**Evidence-Grounded Blocker F1** with severity weights: critical=5, major=3, minor=1.

Baseline V0: single generalist agent, same tools, no structured workflow — measures architecture gain, not model gain.

## Tech Stack

- Next.js 15 (UI + API)
- TypeScript monorepo (pnpm)
- Zod schemas
- Fastify sandbox (Docker)
- Vitest for generated contract tests
