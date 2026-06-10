# Audit Gaps — Tester

**Project safety**: NO-TOUCH CRITIC (shared service, consumed by Website Guru via HTTP API + by E2E Audit [7]/[8] across the ecosystem)
**Live deployment**: `tester.techbiz.ae` (VPS1 PM2)
**Maintainer**: Master orchestration (auto-surface la session start)
**Policy**: audit-only forever via pipeline; fix doar Direct cu confirm explicit per change (CLAUDE.md regula 2d)

**Last audits / artifacts**:
- 2026-05-17 — `Reports/AUDIT_E2E_2026-05-17.md` — ML2 Wave 2 [9] audit CODE+Journey. Score: 93/100 CODE. Journey: 1 OK (Home), 1 EMPTY (/api/health — JSON endpoint, expected). No new P0/P1 gaps. Existing G-API-FALSE-POSITIVE confirmed still open (3 api-tester 404s on `:id` routes = same root cause). NO-TOUCH CRITIC: audit-only, zero fixes.
- 2026-04-24 — `Reports/CODE_SURVEY_2026-04-24.md` (35KB) — codebase-wide static survey
- 2026-04-24 — `Reports/LESSONS_INVENTORY_2026-04-24.md` (30KB) — lessons inventory cross-referenced cu Master/knowledge
- 2026-04-24 — `Reports/PIPELINE_FAILURE_SIGNATURES_2026-04-24.md` (16KB) — categorizare failure modes pipeline
- 2026-04-22 — `Reports/AUDIT_E2E_2026-04-22.md` (11KB) — E2E run
- 2026-04-14 — `Reports/E2E_AUDIT_2026-04-14.md` (15KB)
- 2026-04-11 — `Reports/STRATEGY_VS_IMPLEMENTATION_AUDIT_2026-04-11.md` (20KB) + `STRATEGY_GAPS_FIXED_2026-04-11.md` + `FINAL_100_PERCENT_2026-04-11.md`

**Last fix commits** (relevant Direct-mode changes — see `Reports/DIRECT-CHANGES-2026-05.md` for full ledger):
- 2026-05-11 — review fix: ScenarioSession.login() Set-Cookie capture + resolveDbUrl partial interpolation (commit `6528be3`) — 849/849 tests pass; published @aledan007/tester@0.4.4
- 2026-05-11 — T-005 Prisma spec generator (commit `c0a6a32`) — 14 CRUD scenarios, 691/691 tests pass
- 2026-05-11 — T-004 AI Failure Classifier (commit `acba878`) — 7 new files, 691/691 tests pass
- 2026-05-11 — T-003 Selector Linter ledger entry (commit `a71bf3e`)
- 2026-05-11 — T-003 Selector Linter (commit `585890c`) — 7 files, 668/668 tests pass

---

## ⚠️ INSTRUCȚIUNE PERMANENTĂ — Claude session start

**La fiecare sesiune nouă deschisă pe acest proiect:**
1. Citește acest fișier integral
2. Afișează userului toate items cu Status=OPEN
3. NU aplica fix automat — niciodată — pe acest proiect (NO-TOUCH CRITIC)
4. Pentru orice modificare propusă: protocol propose-confirm-apply
   - Descrie change în limbaj clar + risc + diff propus
   - Așteaptă "ok"/"da"/"aplică" explicit
   - Aplică + smoke check (build/test)
   - Commit cu mesaj `fix/feat(scope): G-XXX <desc>`
   - Update Status: OPEN → Eliminated cu data + commit hash
   - Append entry în `Reports/DIRECT-CHANGES-YYYY-MM.md` (ledger lunar)
5. Înainte de ORICE shared-lib bump care afectează Tester (ex: AIRouter, @aledan/whatsapp): aplică NO-TOUCH cascade per L41 + CLASSIFICATION §6.1 (verifică consumatorii, nu folosi `rsync --delete` pe dist/)

**De ce Tester e NO-TOUCH CRITIC**: e biblioteca centrală de testing (CLI + HTTP server) consumată de:
- Website Guru via HTTP API (`tester.techbiz.ae` bearer auth)
- Master `e2e-audit-runner.mjs` pentru audit-uri [7]
- Toate proiectele ecosistemului via `npx @aledan007/tester journey-audit` pentru audit-uri [8]
Modificări la Tester pot cascada în orice consumator în mod silent dacă nu se respectă protocolul.

---

## OPEN gaps (require user decision)

### G-TSC-DRIFT — [P2] [hygiene] 13 pre-existing `tsc --noEmit` errors in e2e-full-audit + cli/index ✅ ELIMINATED 2026-05-15

- **Surfaced**: ST-2026-05-15-4 handoff flagged "2 pre-existing TS errors" as candidate quick-win. Reality (per `tsc --noEmit` re-run 2026-05-15): **13 errors across 5 type contracts**. Build still succeeded (tsup/esbuild lenient); only strict `tsc --noEmit` caught them. Per L03 (code = mine, Done = 100%), user authorized B2 scope = fix all.
- **Status**: ✅ **ELIMINATED 2026-05-15** (commit pending — this session). `tsc --noEmit` exit 0, 849/849 vitest pass, tsup CJS+ESM+DTS clean.
- **Mechanism — 5 contract drifts vs caller `e2e-full-audit.ts`**:
  1. `captureFullPage(page, opts)` returns `Promise<Buffer>` and 2nd arg is `CaptureFullPageOptions` (not a path string). Caller passed paths × 4 sites (lines 209, 269, 576, 880) → TS2559 ×4.
  2. `runA11yScan(page)` is single-arg. Caller passed `(page, url)` at line 783 → TS2554.
  3. `A11yViolationSummary` has flat `violations[]`. Caller read `r.routes?.[0]?.violations` at line 785 → TS2339.
  4. `PerformanceMetrics` uses short names `fcp`/`lcp`/`tti`. Caller read `firstContentfulPaint`/`largestContentfulPaint`/`totalBlockingTime` at 826-828 → TS2339 ×3. Note: `tti` (TTI) is the available analogue for the removed `totalBlockingTime` (TBT); threshold + label updated accordingly.
  5. `pixelDiffPercent(baseline: Buffer, current: Buffer)` requires Buffers. Caller passed paths at line 884 → TS2345.
  6. `cli/index.ts:260` — commander `.action()` expects `(...args) => void | Promise<void>`. `selfCheckCommand` returns `Promise<number>` (exit code). Wrapped in `async (options) => { await selfCheckCommand(options) }` to discard the number.
- **Fixes applied (surgical, 8 edits, 2 files)**:
  - `e2e-full-audit.ts` 4× `captureFullPage(page, path)` → `const buf = await captureFullPage(page); fs.writeFileSync(path, buf)` (or `.then(buf => writeFileSync)` for catch-chain sites)
  - `e2e-full-audit.ts:783` drop 2nd arg from `runA11yScan(page, url)`
  - `e2e-full-audit.ts:785-786` `r.routes?.[0]?.violations` → `r.violations`; remove redundant inline type on `.filter((v: { impact: string })` — flat type known.
  - `e2e-full-audit.ts:826-841` rename `firstContentfulPaint`→`fcp`, `largestContentfulPaint`→`lcp`, `totalBlockingTime`→`tti`; threshold `tbt<600`→`tti<5000`; label `TBT`→`TTI` in 3 display strings.
  - `e2e-full-audit.ts:884` `pixelDiffPercent(opts.baseline, ssPath)` → `pixelDiffPercent(fs.readFileSync(opts.baseline), buf)` (uses already-captured `buf`, avoids re-reading just-written file).
  - `cli/index.ts:260` action wrap.
- **Impact**: zero runtime behavior change for `tester run` / journey-audit / HTTP server (these paths weren't broken — only `tester e2e-full-audit` CLI subcommand had silent runtime risk: screenshots were never written to disk at the 4 call sites because `captureFullPage` only writes its return value. Now they are. So this also fixes a latent UX bug: e2e-full-audit screenshots actually land on disk.).
- **Verification**: `tsc --noEmit` exit 0 (was 13 errors); `npx vitest run` 849/849; `npm run build` tsup CJS+ESM+DTS clean.
- **Files changed**: `src/cli/commands/e2e-full-audit.ts` (+19/−17), `src/cli/index.ts` (+1/−1).

---

### G-CLASSIFIER-EXT — [P2] [feature] journey-audit classifier config-driven exemptions ✅ ELIMINATED 2026-05-03

- **Surfaced**: cross-project deferred from AVE work (`Projects/ave/ave-platform/AUDIT_GAPS.md` G-JOURNEY-EMPTY closure 2026-05-02 commit `dfcae65`). AVE shipped a post-processor wrapper `scripts/journey-audit-postclassify.mjs` that reclassifies EMPTY false-positives from Tester's journey-audit output. The proper long-term fix lives in Tester itself: config-driven exemption knobs.
- **Status**: ✅ **ELIMINATED 2026-05-03** (commit `5a594aa`) — shipping in `@aledan007/tester@0.3.0`.
- **Mechanism**: extracted classifier from inline runner code into pure function `src/cli/commands/journey-audit-classifier.ts` `classifyPage(input)`. New `JourneyConfig` knobs (all optional, backward-compat):
  - `bodyLenThreshold?: number` — overrides default 200-char "suspiciously empty" threshold.
  - `validContentMarkers?: string` — regex matched against body innerText; if ≥1 hit, EMPTY heuristic is bypassed for that page.
  - `perPageOverrides?: Record<string, { skipEmptyCheck?: boolean; expectedH1?: string }>` — keyed by `link.href`; `skipEmptyCheck:true` exempts a specific page.
  - `formHeroException?: boolean` — default `true` in 0.3.0+. When true, pages with non-empty `h1` AND `buttons>=1` are treated as legitimate even at low bodyLen (form pages, hero landings). Set to `false` to restore 0.2.x always-flag behavior.
- **Impact on consumers**: backward-compatible. Consumers without new keys get `formHeroException:true` default, which CHANGES behavior — pages previously flagged EMPTY because of the hardcoded `bodyLen<200` rule will now pass when they have h1+buttons (the AVE false-positive shape). This is the bug fix; net effect is fewer false-positives on form/hero pages across all consumers.
- **Tests**: `tests/journey-audit-classifier.test.ts` — 20 vitest cases covering basics + threshold override + formHero exception + validContentMarkers + perPageOverrides + exemption precedence.
- **Files changed**: `src/cli/commands/journey-audit-classifier.ts` (new, 130 lines), `src/cli/commands/journey-audit.ts` (refactor: import + use pure fn, ~40 lines net), `tests/journey-audit-classifier.test.ts` (new, ~190 lines).

---

### G-API-START-EMPTY-BODY — [P2] [hardening] POST /api/test/start crashes 500 on empty body

- **Surfaced**: deferred from G-LANDING-001 (2026-05-02). Audit run by [7] tooling caught a pre-existing 500 on empty-body POST.
- **Status**: ✅ **ELIMINATED 2026-05-06** (commit pending — Modules A–M upgrade session) — `src/server/index.ts:86` now guards with `const body = (req.body ?? {}) as {...}` before destructuring. All POST handlers (start, auth-login, verify-fix) updated.
- **Mechanism**: `src/server/index.ts:86` destructures `const { url, config, callbackUrl } = req.body as ...`. If the request has no body (no `Content-Type` or empty payload), Express body-parser leaves `req.body` undefined → destructuring throws TypeError → unhandled rejection bubbles to default 500 with stack trace exposed.
- **Impact**: external probes (uptime monitors, security scanners, fuzz tools) hitting the endpoint without a JSON body get a 500 instead of a clean 400 + structured error. Slight info leak (stack trace if NODE_ENV != production).
- **Fix applied**: guard `req.body` → `const body = (req.body ?? {}) as ...; const { url, config, callbackUrl } = body; if (!url) res.status(400).json({error:'url is required'})`. Same pattern applied to all other POST handlers.

---

### G-AUTH-OPTIN-001 — [P2] [security] HTTP server starts WITHOUT auth when TESTER_API_SECRET is unset — PROPOSED FIX, AWAITING USER CONFIRM (surfaced 2026-06-10, package prepared 2026-06-11)

- **Status**: OPEN — propose-confirm-apply pending (NO-TOUCH CRITIC; codul NU a fost atins).
- **Mechanism**: `src/server/index.ts:493-498` — `app.listen` pornește indiferent de env; fără `TESTER_API_SECRET`, toate endpoint-urile (incl. `POST /api/test/start`, care lansează browser real spre orice URL) sunt neautentificate ("No auth (dev mode)" doar în log). Pe VPS1 secretul E setat azi, dar un viitor redeploy/env-loss ar degrada silențios la no-auth pe `tester.techbiz.ae`.
- **Proposed diff** (fail-loud, ~8 linii, înainte de `app.listen`):
  ```ts
  // Production hard gate: refuse to start unauthenticated. Mirrors
  // Tester-Gateway's GATEWAY_TOKEN placeholder block (TG server.js).
  if (process.env.NODE_ENV === 'production' && !process.env.TESTER_API_SECRET) {
    console.error('FATAL: TESTER_API_SECRET is not set and NODE_ENV=production.')
    console.error('Refusing to start an unauthenticated Tester API. Generate: openssl rand -hex 32')
    process.exit(1)
  }
  ```
- **Risk**: LOW — pe VPS1 secretul e setat (`credentials/tester.env`), deci comportament neschimbat; singura schimbare reală = crash loud în loc de no-auth silențios la mis-config. **Verificare necesară pre-apply**: `ssh root@187.77.179.159 'pm2 env <tester-id> | grep -c TESTER_API_SECRET'` = 1 și că PM2 setează `NODE_ENV=production`.
- **Rollback**: revert commit + `pm2 restart tester`.
- **Apply doar cu confirm explicit user** (CLASSIFICATION §2d). La apply: vitest full suite (858) + deploy + L41 spot-check consumers (WG tester-client + checker + e2e-audit-runner).

---

### G-API-FALSE-POSITIVE — [P3] [audit-tooling] api-tester plugin can't introspect Express dynamic routes ✅ ELIMINATED 2026-05-16 (Master tooling)

- **Surfaced**: AUDIT_E2E_2026-04-22 + 2026-04-26 + 2026-04-28 + 2026-05-02 — "(api-tester) No API endpoints discovered" appears in every E2E audit on Tester landing.
- **Status**: ✅ **ELIMINATED 2026-05-16** — fixed in Master `mesh/qa/plugins/api-tester.js` (NOT Tester source; ledger synced 2026-06-11). The plugin now: (1) reads `<project>/.audit-plugin-config.json` `apiTester.knownEndpoints[]`, (2) probes well-known endpoints (`/api/health`, `/api/openapi.json`, `/api/swagger.json`, `/api/v1/health`) when source-scan finds 0 endpoints, (3) downgrades true zero-API projects to `info` + score 100. See Master TODO_PERSISTENT "api-tester false-positive — DONE 2026-05-16". Next [7] audit on Tester should score api-tester ≥ the old 50.
- **Mechanism**: api-tester plugin in `e2e-audit-runner.mjs` discovers REST endpoints by scraping the rendered HTML for `<a href="/api/...">` links or by reading OpenAPI specs. Tester's landing page (`tester.techbiz.ae/`) is a static `public/index.html` with no API references; the actual REST surface is at `/api/*` registered programmatically in `src/server/index.ts` (Express router, no static manifest). Plugin doesn't probe `/api/openapi.json` or follow well-known patterns.
- **Impact**: every Tester E2E audit shows api-tester at 50/100 (or similar), penalty applied to overall score even though there's no real bug.
- **Recommended fix** (Master tooling concern, NOT Tester source): make api-tester plugin probe a list of well-known endpoints (`/api/health`, `/api/openapi.json`, `/api/swagger.json`) before reporting "No API endpoints discovered"; or accept a config hint listing endpoints. Owner: Master `mesh/audit-plugins/api-tester` (not Tester repo).
- **Workaround in Tester audits**: discount api-tester score from overall when the project is known to be a CLI/library + HTTP server (Tester is BOTH).

---

### G-INNERHTML-FP — [P3] [audit-tooling] security-scanner reports phantom innerHTML in nonexistent files ✅ ELIMINATED 2026-05-16 (Master tooling)

- **Surfaced**: AUDIT_E2E_2026-04-22 reports `(security-scanner) innerHTML assignment found in LoginForm.ts` + `MfaInput.ts` + `SessionStatus.ts`.
- **Status**: ✅ **ELIMINATED 2026-05-16** — fixed in Master `mesh/qa/plugins/security-scanner.js` (NOT Tester source; ledger synced 2026-06-11). Issue descriptions now carry the POSIX relative path (no bare basenames for downstream AI summarizers to invent paths from), skip-set extended (.vercel/.turbo/out/coverage/...), `fs.existsSync` guard between readdir and read. Hardened further 2026-06-10 (Master commit `8d7a73d`): eval word-boundary + innerHTML JSON.stringify allowlist + file:line in findings.
- **Verification**: `find /Users/danciulescu/Projects/Tester -name 'LoginForm*' -o -name 'MfaInput*' -o -name 'SessionStatus*'` returns empty. The only `innerHTML` reference in Tester source is `src/core/safety.ts:104` which is a regex pattern used to detect `innerHTML` in user-supplied test scripts — not an assignment.
- **Hypothesis**: security-scanner may be scanning `node_modules/` deep paths (some auth/MFA UI lib has these files) or generating phantom paths from AI-summarized findings.
- **Recommended fix** (Master tooling): security-scanner plugin should report file paths relative to project root + verify they exist before emitting findings. Owner: Master `mesh/audit-plugins/security-scanner`.

---

### G-INFINITE-LOAD-UNAUTH — [P3] [known-limitation] `detectInfiniteLoading` runs without auth cookies ✅ ELIMINATED 2026-05-07

- **Surfaced**: code review 2026-05-07
- **Status**: ✅ **ELIMINATED 2026-05-07** — implementation was already in place (documentation gap only)
- **Mechanism**: `e2e-full-audit` Step 14 spawns a separate `BrowserCore` instance but **DOES** transfer cookies: (1) Step 4 login captures cookies via `await page.cookies()` into `capturedAuthCookies` (line 866), (2) Step 14 passes `capturedAuthCookies` to `detectInfiniteLoading(ilPage, pageUrl, 8000, capturedAuthCookies)` (line 884), (3) `detectInfiniteLoading` injects them via `page.setCookie(...authCookies)` before navigation (line 134). Test coverage added: `tests/e2e-full-audit.test.ts` lines 259-290 verify cookie injection order (setCookie before goto).
- **Impact**: NO false PASS on Step 14 — authenticated pages are tested with valid session cookies. The gap description was based on code inspection without reading the full flow; the actual implementation was complete.
- **Verification**: (1) Test `"injects auth cookies before navigating to page"` passes (vitest 1/1). (2) 595/595 tests pass post-fix. (3) Cookie signature preserved: `CookieParam[]` type throughout, no shape mismatch.
- **Files affected**: implementation pre-existing (no changes needed). Tests added in this session validate the existing logic.

---

### G-DEAD-SCRIPTS — [P3] [hygiene] Untracked .mjs debug scripts at repo root ✅ ELIMINATED 2026-05-07

- **Surfaced**: `git status` after 2026-05-02 audit session shows ~17 untracked `.mjs` files at Tester repo root: `client-home-debug.mjs`, `eat-full-walk.mjs`, `eat-onboarding-screenshot.mjs`, `eat-photo-walk.mjs`, `full-ui-debug.mjs`, `sso-{final,firefox,fragment,iframe,meals,postmsg,race,real,strict,trace}-test.mjs`, `sw-killswitch-test.mjs`, `sso-final-test.mjs`.
- **Status**: ✅ **ELIMINATED 2026-05-07** — `.gitignore` extended with `/*.mjs` (root-only, safe: `scripts/build-docs.mjs` tracked and unaffected) + `.tester/` + `journey-audit-results/` for generated output dirs.
- **Mechanism**: these are ad-hoc Playwright/Puppeteer scripts written during cross-project investigations (eat onboarding flow, SSO debug, killswitch testing). They're not part of the Tester library or test suite, but they live at repo root where they're discoverable by audit plugins (which may scan them and emit findings).
- **Fix applied**: `.gitignore` additions — `/*.mjs` anchored to root (doesn't match `scripts/*.mjs`), `.tester/` (runtime temp dir), `journey-audit-results/` (CLI output). Scripts remain on disk (untracked + ignored); no deletion — preserves any in-flight investigation state.

---

### G-JOURNEY-003 — [P2] Published `@aledan007/tester@0.2.0` requires `login` field; local dev allows it optional ✅ ELIMINATED 2026-05-03

- **Surfaced**: 2026-04-28 (Master ML2 Wave 2 [8] Tester audit)
- **Status**: ✅ **ELIMINATED 2026-05-03** via `@aledan007/tester@0.3.0` publish (commit `5a594aa`).
- **Symptom**: `npx @aledan007/tester@0.2.0 journey-audit --config <no-login-config>` fails with `Config is missing required fields (name, baseUrl, navLinks, login)`. Local source at `src/cli/commands/journey-audit.ts:143` has `const needsAuth = !!cfg.login` (login optional). Published 0.2.0 was built before the no-auth path was added.
- **Fix**: 0.3.0 ships the current source which already has `cfg.login` optional + `needsAuth = !!cfg.login` runtime gating. Plus adds the classifier extension (G-CLASSIFIER-EXT).
- **Verified**: post-publish `npx @aledan007/tester@0.3.0 journey-audit --config <no-login>` should succeed without the missing-field error. Live verify pending consumer usage.

---

### G-001 — [P1] [Triage Pending] Triage rapoarte audit recente în G-XXX cu prioritizare ✅ ELIMINATED 2026-05-03

- **Status**: ✅ **ELIMINATED 2026-05-03** (Tester dedicated session per §2d waiver)
- **Created**: 2026-04-25
- **Sources read**: `Reports/AUDIT_E2E_2026-04-22.md` + `2026-04-26.md` + `2026-04-28.md` + `2026-05-02.md` + `Reports/CODE_SURVEY_2026-04-24.md` + `Reports/PIPELINE_FAILURE_SIGNATURES_2026-04-24.md` + `Reports/LESSONS_INVENTORY_2026-04-24.md`.
- **Triage outcome**: 4 new G-XXX entries below + 2 closures in this session:
  - G-CLASSIFIER-EXT (this session) — config-driven journey-audit classifier exemptions, ships in 0.3.0
  - G-JOURNEY-003 (this session) — 0.3.0 publish closes
  - G-API-START-EMPTY-BODY (new, P2) — POST /api/test/start 500 on empty body
  - G-API-FALSE-POSITIVE (new, P3) — api-tester plugin can't introspect Express dynamic routes
  - G-INNERHTML-FP (new, P3) — security-scanner reports phantom files
  - G-DEAD-SCRIPTS (new, P3) — untracked .mjs debug scripts at repo root
- **Already covered elsewhere** (NOT re-filed):
  - Tester landing page a11y/security → G-LANDING-001 already eliminated 2026-05-02
  - Pipeline zombie cleanup (44% of failures) → tracked in `Master/TODO_PERSISTENT.md` + Master `mesh/scripts/watcher-reaper.js`. Not Tester source-code concern.
  - Touch targets <44 on Tester landing → covered by G-LANDING-001
  - Code-survey "untested paths" / "typing" — no concrete bug, just inventory; deferred until specific failure surfaces.
- **Note on AUDIT_E2E_*-recurring findings**: most of the 4 recent AUDIT_E2E reports surface the same items (CSP, contrast, mobile touch on Tester landing) — all closed via G-LANDING-001 on 2026-05-02. The 2026-05-02 audit's "Top 5" (eval/setTimeout/hardcoded creds/etc.) are AI-generated by AIRouter against test-fixture code and are LOW-confidence finger-pointing; not actionable as-is.

---

## G-CU-001 — Computer-Use fallback for journey-audit Playwright failures

- **Status**: Eliminated (commit pending — see Update Log entry 2026-04-25)
- **Created**: 2026-04-25
- **Resolved**: 2026-04-25 (this session)
- **Context**: When Playwright/CSS selectors fail in journey-audit (dynamic
  modal, lazy-loaded login button, occluded element), the spec previously
  threw and marked the run as failed. Now: when env flag
  `TESTER_COMPUTER_USE_FALLBACK=1` is set, the spec falls back to Claude
  Computer Use vision-loop (Sonnet 4.5+, beta `computer-use-2025-01-24`)
  to identify and click the target element via screenshot + coordinate.
- **Files added**:
  - `journey-audit/lib/ai-computer.ts` (~300 lines TS, vendored from
    `Master/mesh/engine/ai-computer.js` IM P2.10) — Anthropic Computer
    Use tool-loop driver. Decoupled from Playwright by design.
  - `journey-audit/lib/computer-use-fallback.ts` (~150 lines TS) —
    Playwright-specific wrapper. Single export: `tryComputerUseStep(page,
    intent, options)`. Maps normalized actions (left_click, type, key,
    drag, wait, etc.) to `page.mouse` / `page.keyboard` calls.
  - `tests/journey-audit-computer-use-fallback.test.ts` (~250 lines, 11
    vitest cases) — offline smoke covering: pure helpers (buildComputerTool
    + normalizeComputerAction boundaries), graceful auth failure, end_turn
    loop termination, screenshot-intercept + click-loop dispatch, Playwright
    wrapper integration.
- **Files modified**:
  - `journey-audit/tests/sidebar-walk.spec.ts` (+18/-3) — login submit
    click wrapped in try/catch; on failure with flag on, invokes
    `tryComputerUseStep` with intent "Click the login Submit / Sign In
    button". Throws original error if fallback also fails.
- **Smoke status**: 11/11 vitest pass offline. TS clean (`tsc --noEmit`).
- **Live validation status**: DEFERRED — requires Anthropic credit + a
  Sonnet 4.5+ accessible model + a real journey-audit run targeting an
  app with a flaky login UI. Default flag off → no behavior change in
  consumer pipelines.
- **Risk profile**:
  - 🟢 Default flag off → byte-identical pre-existing behavior on all
    consumers (Website Guru, e2e-audit-runner, journey-audit CLI).
  - 🟡 Flag on → Anthropic Sonnet vision tokens consumed (~$0.05-0.15
    per fallback attempt with maxTurns: 6).
  - 🟡 Flag on → potential misclick if Vision misidentifies submit button;
    mitigated by `throw loginErr` if fallback fails.
  - 🟢 Vendored helper has stable module boundaries; cross-repo sync via
    cp + adapt when Master ships meaningful upstream changes.

---

### G-LANDING-001 — [P1] [a11y/security] tester.techbiz.ae landing page structural fixes ✅ ELIMINATED 2026-05-02

- **Surfaced**: 2026-05-02 [7] CODE audit (76/100, 2 HIGH a11y + 1 HIGH security + 6 MED mobile/api)
- **Status**: ✅ **ELIMINATED 2026-05-02** (commit `5ae5ff0` + nginx config) — propose-confirm-apply 2 iterations (Phase A+B then Phase B' delta)
- **Discovery (per L82 research-before-proposing)**: `/` on `tester.techbiz.ae` is served by **nginx-static** at `/var/www/tester/public/index.html`, NOT by the Express HTTP server. The file was VPS-only divergent (initial scaffold commit `732af58` 2026-04-04, never tracked back to GitHub). NO consumer cascade risk: zero impact on `@aledan007/tester` npm package, HTTP API endpoints, or journey-audit CLI.
- **Phase A** — landing HTML fixes: brought `public/index.html` into local repo + 5 fixes
  - **Contrast**: text + link colors `rgba(255,255,255,.5)` → `.82`/`.78`; secondary `.3` → `.65`; footer `.2` → `.65` (all ≥4.5:1 WCAG AA on `#0f0c29`)
  - **Touch targets**: all `<a>` get `min-height/min-width:44px` + `display:inline-flex;align-items:center` (44×44 click zone preserved while visual size matches design intent)
  - **Font-size**: footer `.7rem` → `.78rem`, crossnav `11px` → `.75rem`, secondary small `.8rem` → `.85rem` (all ≥12px)
  - **Skip-nav**: added `<a class="skip-link" href="#main-content">` with focus-only positioning
  - **Semantic HTML**: added `<nav aria-label>`, `<main id>`, `aria-current="page"` on active crossnav link, `:focus-visible` outlines for keyboard nav
- **Phase B** — nginx CSP + 3 security headers on `location = /`:
  - `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  - `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
- **Phase B' delta** (after first audit revealed CSP `default-src 'self'` blocked axe-core injection — `100/100` was falsely optimistic):
  - Added `script-src 'self' 'unsafe-inline'` (allows axe `addScriptTag` to inject; static landing has no real scripts so surface stays minimal)
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
  - `Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()`
- **Phase C** — local repo sync: `5ae5ff0` brings `public/` under git tracking on `aledan2809/Tester` (closes VPS↔GitHub drift)
- **Verification (honest per L83)**:
  - [7] audit progression: **76 → 88 → 91/100** (+15 total, 2 iterations)
  - a11y-scanner 55 FAIL → **100 PASS** (real, post-Phase B' axe could inject)
  - mobile-tester 50 FAIL → **100 PASS** (touch targets resolved)
  - security-scanner 90 PASS (1 missing CSP) → 85 (2 new findings from deeper scan) → **100 PASS** (all 6 headers complete)
  - Plugins at 100: 8/9 (only api-tester at 50 = pre-existing false-positive, plugin can't introspect Express dynamic routes)
  - Consumer spot-check: tester `/api/health` 200, MA `/` 200, eCabinet `/api/health` 200 — zero regression
- **Files**: local `public/index.html` (new, +1 file 60 lines effective), VPS `/etc/nginx/sites-available/tester.techbiz.ae` (+8 lines headers), VPS `/var/www/tester/public/index.html` (synced from local)
- **Backups**: `/etc/nginx/sites-available/tester.techbiz.ae.bak-2026-05-02-pre-csp` + `/var/www/tester/public/index.html.bak-2026-05-02-pre-a11y`
- **Out of scope (deferred)**: api-tester false-positive plugin limitation (G-API-FALSE-POSITIVE candidate — not a Tester bug); pre-existing `POST /api/test/start` 500 on empty body (handler doesn't validate `req.body` shape — separate G-XXX hardening item)

---

## Eliminated gaps (history)

### G-JOURNEY-002 — Configurable login successUrlTimeout in journey-audit

- **Status**: Eliminated (2026-04-27)
- **Symptom**: `journey-audit/tests/sidebar-walk.spec.ts` had a hardcoded 15s `waitForURL` timeout after login click. Apps with multiple sequential post-login fetches before redirect (e.g., 4pro-eat: SSO cookie set + identity verify + onboarding-state hydrate) hit the timeout sporadically and the audit failed before walking nav links.
- **Fix**: Added optional `login.successUrlTimeout?: number` field to `JourneyConfig`; both `waitForURL` calls (initial attempt at line 96, Computer-Use retry at line 111) now read `CFG.login.successUrlTimeout ?? 30000`. Default raised from 15s → 30s; existing configs without the field receive the new default silently. Companion change in `4pro-eat/.journey-audit.json` sets explicit `"successUrlTimeout": 30000`.
- **Files**: `journey-audit/tests/sidebar-walk.spec.ts` (3 surgical edits — interface + 2 timeout call-sites). Companion: `4pro-eat/.journey-audit.json` (+1 line).
- **Verification**: `npx tsc --noEmit` clean, `npm test` 550/550 pass.
- **Commit**: TBD (added on this session).

---

---

## Update Log

| Date | Change |
|------|--------|
| 2026-04-25 | Creat ledger inițial (Master deep-audit Phase 4 follow-up). G-001 OPEN: triage rapoarte audit existente. |
| 2026-04-25 | Added + Resolved **G-CU-001** — Computer-Use fallback for journey-audit Playwright failures. 4 files added (ai-computer + fallback + smoke + spec edit), 11/11 vitest, TS clean. Default flag off; live validation deferred (no Anthropic credit). |
| 2026-04-27 | Resolved **G-JOURNEY-002** — Configurable `successUrlTimeout` for journey-audit login (default 15s → 30s, optional field per-config). 3 surgical edits in spec + companion config update on 4pro-eat. TS clean, vitest 550/550. |
| 2026-04-28 | Created `Tester/.journey-audit.json` (1 new file, no source code touched) for Master ML2 Wave 2 [8] AVE batch. Audit ran 1 OK + 1 EMPTY (Home + /api/health). User confirm "confirm Tester Journey (UI real)". Logged in DIRECT-CHANGES-2026-04. New OPEN: **G-JOURNEY-003** below. |
| 2026-05-06 | **Modules A–M upgrade** (Direct mode, NO-TOUCH CRITIC §2d waiver, propose-confirm-apply per session). Delivered: **A** `ProjectRegistry` (SQLite multi-project store), **B** `CredentialsManager` (AES-256-GCM encrypted, role-based), **F** Auth Audit (cookies, logout, private routes, session refresh), **G** Loading Timer (CRITICAL >15s auto-flag), **H** Form Audit (type-confusion fuzz ×12 payloads, duplicate-submit), **I** Security Assertions (header uniqueness, 401-without-auth, HTML-vs-JSON, CORS, mixed content), **J** Hydration+CSP (evaluateOnNewDocument listener), **K** Playwright Recorder (video+trace, dynamic import), **M** Post-Fix Verification Gate (6 layers: re-run, regression smoke, tsc+eslint, security scan, console+network, visual diff). New CLI: `tester e2e-full-audit --url <URL>` (9-step unified: load→security→auth→forms→console→a11y→perf→visual→trace). New HTTP endpoint: `POST /api/test/verify-fix`. **G-API-START-EMPTY-BODY ELIMINATED** (body null-guard). Build: CJS+ESM+DTS clean. Committed & pushed with DIRECT-CHANGES-2026-05 entry. |
| 2026-05-11 | **T-003 selector linter** (commit `585890c`). Half A (test-side linter): `src/linter/rules.ts` + `src/linter/test-linter.ts`; Half B (source scanner): `src/linter/source-scanner.ts`; CLI handlers `src/cli/commands/lint.ts` + `src/cli/commands/scan-selectors.ts`; wired in `src/cli/index.ts`; 32 vitest tests. 668/668 full suite pass. No existing code modified. Ledger: DIRECT-CHANGES-2026-05. |
