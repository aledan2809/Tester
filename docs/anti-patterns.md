# Anti-patterns — catch these before you commit

Every pattern here has cost us time at least once. The T-000 lesson engine
(`tester lessons scan <path>`) flags them; the pre-commit hook
(`tester lessons install-hooks`) fails the commit when unfixed.

## L-F2 — CSS `!=` is not valid selector syntax

```ts
// ✗ BAD
document.querySelectorAll('a[href!="/login"]')
button[data-testid!=submit]

// ✓ GOOD
document.querySelectorAll('a:not([href="/login"])')
[data-testid]:not([data-testid="submit"])
```

The `!=` operator looks like jQuery; browsers raise `SyntaxError`. Tester
auto-rejects this in `tester selfcheck`. Detected in test code by `tester
lessons scan` (L-F2 regex).

## L-F8 — Case-sensitive regex vs Tailwind `uppercase`

```ts
// ✗ BAD — Tailwind `uppercase` class rewrites visible text. innerText is
// uppercase; your regex is lowercase; false negative.
await expect(page.innerText()).toMatch(/Formula/)

// ✓ GOOD
await expect(page.innerText()).toMatch(/formula/i)
// or: match against textContent (bypasses CSS transforms)
```

Rule: **default to `/i` flag for any text-match regex**; flip to strict
only if case discrimination is a deliberate assertion.

## L-F10 — Unscoped vendor / button picker matches onboarding UI

```ts
// ✗ BAD — matches ANY visible "Getting started" button, including the
// onboarding walls you should have skipped.
await page.getByText(/Add vendor/).click()

// ✓ GOOD — scope to container + use stable attribute
await page.locator('[data-testid=vendor-list] [data-testid=add-vendor]').click()
```

Rule: if a text match could plausibly fire on an onboarding / marketing /
help panel, **don't use textContent as the primary selector**. Ask the
app team for `data-testid`.

## L-05 — Missing `networkidle2` on auth flows

```ts
// ✗ BAD — `domcontentloaded` returns before the session cookie is written
await page.goto('/login', { waitUntil: 'domcontentloaded' })
await fillLogin()
expect(await page.url()).toMatch('/dashboard')  // FLAKY

// ✓ GOOD
await page.goto('/login', { waitUntil: 'networkidle2' })
```

Rule: on pages that set cookies / redirect-after-success, use
`networkidle2` or explicit wait for the target URL.

## L-24 — 0ms or sub-500ms settle on navigation

```ts
// ✗ BAD — race condition on [role=dialog]
await page.click(openBtn)
await expect(page.locator('[role=dialog]')).toBeVisible()

// ✓ GOOD — explicit settle, not fixed-sleep
await page.click(openBtn)
await page.waitForSelector('[role=dialog]', { timeout: 3000 })
```

T-007 retry budget (default 2) with exponential backoff (1.5x, cap 8s)
also covers this at the executor level — but write the correct wait the
first time instead of relying on retry.

## L-30 — SQL-looking string in console.log flagged as injection

```ts
// ✗ BAD — RED_TEAM scanner used to report this as SQL injection
console.log('SELECT count from users:', count)

// ✓ STILL FINE post-fix — F-002 added a benign-context guard that
// requires a real DB-call on the same line (prisma.$queryRaw, sql``,
// pool.query, etc.) before flagging.
```

If you still hit false positives, the pattern is probably inside a JSX
`message:` / `toast.*` / `fetch(` context; add it to the benign guard in
`mesh/red/red-agent.js`.

## L-40 — Pipeline scope creep (75 files for a 1-file bug)

```
# ✗ BAD — `npm run lint -- --fix` sweeps unrelated files
# ✓ GOOD — edit only the file that reproduces; `tester affected --tags`
  to pick the affected subset
```

Master dev-agent now emits `mesh/state/scope-warnings/*.json` when a
diff exceeds 10 files or 500 LOC; orchestrator pauses into
`waiting_clarification` (Layer 3 of L-40 fix).

## L-41 — rsync --delete on shared-lib dist/ breaks downstream consumers

```bash
# ✗ BAD — deletes .mjs variants that eCabinet / PRO / Tester import
# conditionally via `exports.import`.
rsync --delete -av AIRouter/dist/ vps:/var/www/AIRouter/dist/

# ✓ GOOD — no --delete; verify exports post-copy:
rsync -av AIRouter/dist/ vps:/var/www/AIRouter/dist/
ssh vps 'cd /var/www/AIRouter && jq .exports package.json; ls dist/'
```

After any shared-lib deploy, health-check EVERY NO-TOUCH consumer (not
just the one you're patching) per Master CLAUDE.md §6.1.

## L-42 — regex matches domain-admin guard it should have been paired with

Fixed in T-003 AST linter (commit `4484a2d`). Regex-only was too weak —
require the paired `requireDomainAdmin` call via ts-morph when flagging.

## F-010 (deferred) — unbounded platform timeouts in tester-client

Website Guru's `TesterClient` can hang forever on a slow backend. Set
`config.timeout` when calling `startTest`; CI runners must cap themselves
at job-level as a safety net.

## Meta — when you hit a new anti-pattern

1. `tester lessons learn --from-failure <log>` produces a YAML stub.
2. Fill `detection.pattern` + `diagnosis.symptom_signatures` +
   `regression_test` path.
3. Commit the lesson — it's now part of the scan corpus for every
   future session / pipeline.
