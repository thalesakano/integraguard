# Demo rehearsal — golden path + fallback

Verified checklist for recording / live judges. Prefer **sandbox via pnpm** if Docker Desktop is down.

## Preflight (clean shell)

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd build
pnpm.cmd test
pnpm.cmd doctor
pnpm.cmd --filter @integraguard/sandbox start   # :4000
# other terminal:
pnpm.cmd dev                                   # :3000
```

Expected:

- `pnpm doctor` → build artifacts OK; sandbox healthy if start succeeded
- http://localhost:4000/health → `{"status":"ok"}`
- http://localhost:3000 → landing

## Golden path (live, ~2–3 min on camera)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click **Run hackathon demo** (authorization-07) | Run created |
| 2 | LangGraph ON, Human gate ON (auto-approve OFF) | Pending POST shown |
| 3 | Inspect redacted request | No raw tokens |
| 4 | **Approve** | Trajectory continues |
| 5 | Optional: note adaptive loop if 400 → counterprobe | `result-analyst` then `probe-designer` |
| 6 | Open Readiness Pack | `BLOCKED`, Documented vs Observed, Evidence Chain |
| 7 | Copy reproduction / vendor question | Clipboard text, no secrets |
| 8 | Download ZIP | Contains `vendor-issue.md`, SARIF/JUnit if via CLI |

CLI twin (same scenario docs file):

```powershell
pnpm.cmd integraguard check --docs scenarios/authorization-07/api-docs.md --target http://localhost:4000/scenarios/authorization-07/ --out demo-out
echo $LASTEXITCODE   # expect 1 (verified drift)
```

## Fallback path (offline / no sandbox)

If Docker/sandbox fails mid-demo:

```powershell
pnpm.cmd integraguard replay runs/llm-matrix/deterministic.json
# labeled [replay] — not a live probe
```

Or show committed metrics:

```powershell
pnpm.cmd eval:compare v0-baseline v4-evidence-gate
```

Say on camera: **“This segment is offline replay / committed eval — not a live LLM call.”**

## Demo-only public deploy

```powershell
$env:INTEGRAGUARD_DEMO_MODE="1"
pnpm.cmd dev
# Real API / external docs URL must 403
```

## Screenshots

Updated under `docs/screenshots/`:

- `create-analysis.svg` — landing CTA + modes
- `workflow-graph.svg` — agentic graph + human gate + adaptive loop
- `readiness-pack.svg` — Documented vs Observed + evidence chain + ZIP
- `demo-storyboard.svg` — 20s approve → pack storyboard

## Pass criteria

- [ ] Golden path reaches BLOCKED pack without secrets on screen
- [ ] Fallback path rehearsed once with `[replay]` wording
- [ ] `pnpm test` green before recording
- [ ] Deterministic F1 table matches `runs/v4-evidence-gate/metrics.json` (not agentic eval)
