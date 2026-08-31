# Security Model

## Secrets

- Never store API keys, tokens, or passwords in `integraguard.config.yaml`.
- Reference **environment variable names** only (`credentials.apiKeyEnv`).
- Values are resolved at execution into non-serializable `executionHeaders` / workflow options — never onto `AnalysisInput`.
- HTTP probe results, trajectories, and ZIP artifacts are redacted before persistence.

## Probe policy

| Risk | Default |
|------|---------|
| GET / HEAD / OPTIONS | Auto-execute when host allowlisted |
| POST / PUT / PATCH / DELETE | Require human approval (unless `autoApproveProbes`) |
| Host outside `allowedHosts` | Blocked |
| Method outside `allowedOperations` | Blocked |
| Budget exhausted | Inconclusive |

## Real API mode

Use staging only. Human gate recommended. Mutating probes never run silently against production.
`autoApproveProbes` defaults to **false** for `real-api` / `docs-url`; `allowedHosts` must be explicit.

## Demo mode

Set `DEMO_MODE=1` or `INTEGRAGUARD_DEMO_MODE=1` to run a judge-safe deployment:

- Analyses reject non-localhost sandbox targets (403).
- `/api/fetch-docs` rejects external documentation URLs (403).
- Use bundled scenarios against the local sandbox (`localhost:4000`).
- Public/hosted demo stays **replay-only** until auth + egress controls are complete — do not enable Real API crawl/probe against arbitrary URLs.

## Fail-closed defaults

- Empty `allowedHosts` never inherits the caller’s target host.
- Critical requirements without evidence cannot yield `READY` / CLI exit `0`.
- Mutating probes require human approval (or `INTEGRAGUARD_ALLOW_MUTATION=1` for generated contract tests).
- Agentic pause/resume restores the full checkpoint (expectations, observations, drifts) — not a reconstructed approximation.
- Secrets stay in env vars / `executionHeaders`; they are absent from checkpoints, packs, and ZIP artifacts.

## LLM

Optional. Enriches docs/probe hypotheses. **Evidence Gate** remains the only path to verified findings.

## Dependency advisories

See [dependency-advisories.md](dependency-advisories.md) for `pnpm audit --prod` triage (sandbox name collision, langsmith, postcss).
