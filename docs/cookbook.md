# Cookbook — recurring patterns

## Auth: env-driven login in a spec

```ts
async function login() {
  const base = process.env.TEST_BASE_URL || 'http://localhost:3000'
  const email = process.env.TEST_EMAIL
  const password = process.env.TEST_PASSWORD
  if (!email || !password) throw new Error('TEST_EMAIL/TEST_PASSWORD required')
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`login failed: ${res.status}`)
  const body = await res.json() as { token?: string }
  if (!body.token) throw new Error('login returned no token')
  return { token: body.token }
}
```

`tester init <feature>` generates this helper by default — opt out with `--no-with-login`.

## Harness self-check at suite boot

```ts
import { runSelfCheck, exitCodeForSummary } from '@aledan007/tester/self-test'
beforeAll(() => {
  const summary = runSelfCheck()
  if (exitCodeForSummary(summary) >= 2) {
    throw new Error('harness self-check failed — stop before blaming the product')
  }
})
```

This catches harness-level defects (invalid CSS, case-sensitive regex vs Tailwind `uppercase`, tight timing defaults) before you classify the failure as a product bug. Pair with `tester selfcheck` in CI.

## CRUD happy-path with cleanup

```ts
const createdIds: string[] = []

afterAll(async () => {
  for (const id of createdIds.splice(0)) {
    await fetch(`${BASE}/api/widgets/${id}`, { method: 'DELETE', headers: { ... } })
  }
})

it('create → read → delete', async () => {
  const { token } = await login()
  const post = await fetch(`${BASE}/api/widgets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'w1' }),
  })
  expect(post.status).toBe(201)
  const created = await post.json() as { id: string }
  createdIds.push(created.id)
  const get = await fetch(`${BASE}/api/widgets/${created.id}`, { headers: { Authorization: `Bearer ${token}` } })
  expect(get.status).toBe(200)
})
```

`tester generate --from-prisma` scaffolds this exact pattern.

## Visual regression: capture + compare

Capture initial baseline per route (any runner that produces full-page PNGs):

```bash
tester snapshot --baseline --project myapp --route "/home" --png /tmp/home.png
tester snapshot --baseline --project myapp --route "/admin" --png /tmp/admin.png
```

Compare in CI:

```bash
tester snapshot --compare --project myapp --route "/home" --png /tmp/home.png --max-diff 1
```

- Exit 1 on diff > `--max-diff` (default 1%).
- Exit 0 on seeded first run when `--capture-if-missing` is set.
- `tester snapshot --approve --project myapp --route "/home" --png /tmp/home.png` accepts a new baseline (use after intentional UI change).

Baselines live under `<cwd>/.tester/baselines/<project>/<safeRoute>.png` with a sibling `.meta.json` (sha256 + capturedAt + viewport).

## A11y: lock a baseline, fail on NEW critical/serious

```bash
# Your runner writes: { "scans": [{ "route": "/home", "violations": [...] }] }
tester a11y --baseline --project . --from /tmp/a11y-scan.json
```

Subsequent runs:

```bash
tester a11y --check --project . --from /tmp/a11y-scan.json --json
# Exit 1 on any new critical/serious violation OR a11y-budget.yaml breach.
```

Tolerate pre-existing issues (`suppressed_until` field planned as follow-up) — current behavior: only NEW or worsened critical/serious violations fire regression.

## Perf: CI PR comment with before/after delta

```bash
# Caller produces runs.json { "runs": [{ "route": "/x", "metrics": { "lcp_ms": 2100 } }] }
tester perf --check --project . --from main/runs.json      # fail on budget breach
tester perf --delta --before main/runs.json --after pr/runs.json --project . --markdown
```

The `--markdown` output is ready to paste into a PR comment: breach table + before/after delta with Δ%.

## Failure routing via T-B3 triage

```bash
tester triage /tmp/fail.log --force-heuristic --json
# → { "route": "tester-self" | "guru" | "flake-retry" | "env-fix", "verdict": ..., "confidence": ... }
```

TWG orchestrator should call this BEFORE dispatching to Guru — `HARNESS_BUG` routes stay in Tester.

## Regression capture after a green fix cycle

```bash
tester regression add \
  --slug tailwind-uppercase-innertext \
  --title "Tailwind uppercase breaks case-sensitive regex" \
  --lesson-id L-F8 \
  --fix-commit 301f2a9 \
  --expire-at 2026-10-01
```

Spec lands under `tests/regressions/2026-04-24-tailwind-uppercase-innertext.spec.ts`. Port your reproducer into the `it.skip(...)` block, flip to `it(...)`, commit.

## Session continuity

```bash
tester session start "wave 2 kickoff"
tester session log --kind commit --note "ee5cbec T-007"
tester session end --tests-passing 293 --tests-total 293 \
  --commits ee5cbec,f5a3bf3 \
  --summary-note "wave 1 done"
# Next session:
tester session last   # full JSON of the prior session
tester session list   # recent sessions, latest first
```
