# Audit Gaps — Tester

**Project safety**: NO-TOUCH CRITIC (shared service, consumed by Website Guru via HTTP API + by E2E Audit [7]/[8] across the ecosystem)
**Live deployment**: `tester.techbiz.ae` (VPS1 PM2)
**Maintainer**: Master orchestration (auto-surface la session start)
**Policy**: audit-only forever via pipeline; fix doar Direct cu confirm explicit per change (CLAUDE.md regula 2d)

**Last audits / artifacts**:
- 2026-04-24 — `Reports/CODE_SURVEY_2026-04-24.md` (35KB) — codebase-wide static survey
- 2026-04-24 — `Reports/LESSONS_INVENTORY_2026-04-24.md` (30KB) — lessons inventory cross-referenced cu Master/knowledge
- 2026-04-24 — `Reports/PIPELINE_FAILURE_SIGNATURES_2026-04-24.md` (16KB) — categorizare failure modes pipeline
- 2026-04-22 — `Reports/AUDIT_E2E_2026-04-22.md` (11KB) — E2E run
- 2026-04-14 — `Reports/E2E_AUDIT_2026-04-14.md` (15KB)
- 2026-04-11 — `Reports/STRATEGY_VS_IMPLEMENTATION_AUDIT_2026-04-11.md` (20KB) + `STRATEGY_GAPS_FIXED_2026-04-11.md` + `FINAL_100_PERCENT_2026-04-11.md`

**Last fix commits** (relevant Direct-mode changes — see `Reports/DIRECT-CHANGES-2026-04.md` for full ledger):
- 2026-04-22 — journey-audit CLI patch (no-auth config support, 4 surgical edits) per L39
- 2026-04-25 — `Reports/DIRECT-CHANGES-2026-04.md` last entries

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

### G-JOURNEY-003 — [P2] Published `@aledan007/tester@0.2.0` requires `login` field; local dev allows it optional

- **Surfaced**: 2026-04-28 (Master ML2 Wave 2 [8] Tester audit)
- **Symptom**: `npx @aledan007/tester@0.2.0 journey-audit --config <no-login-config>` fails with `Config is missing required fields (name, baseUrl, navLinks, login)`. Local source at `src/cli/commands/journey-audit.ts:143` has `const needsAuth = !!cfg.login` (login optional). Published 0.2.0 was built before the no-auth path was added.
- **Impact**: Consumers running journey-audit on no-auth public sites (landing pages, docs sites, marketing pages) cannot use the published npm distribution — must run from local Tester checkout.
- **Recommendation**: Bump `@aledan007/tester` to 0.3.0 with the no-auth path included. Quick check: `npm view @aledan007/tester versions` → only 0.2.0 published. Build + publish would close this. Out-of-scope for current ML2 audit session; logged for Tester triage.
- **Workaround in current session**: ran via `node /var/www/Tester/dist/cli/index.js` (local build) on Master machine.

---

### G-001 — [P1] [Triage Pending] Triage rapoarte audit recente în G-XXX cu prioritizare

- **Status**: OPEN
- **Created**: 2026-04-25
- **Context**: Folder-ul `Reports/` conține ~5 rapoarte audit recente (CODE_SURVEY, LESSONS_INVENTORY, PIPELINE_FAILURE_SIGNATURES, AUDIT_E2E, STRATEGY_VS_IMPLEMENTATION) cu finding-uri detaliate, dar **niciun finding nu a fost convertit în G-XXX entry** cu prioritate, owner, plan de fix. Fără triage, ledger-ul nu reflectă starea reală a gap-urilor — se contrazice cu rolul lui (auto-surface la session start ar trebui să arate items concrete acționabile).
- **Files to read** (în ordinea relevanței):
  1. `Reports/CODE_SURVEY_2026-04-24.md` — finding-uri statice (typing, error handling, untested paths)
  2. `Reports/PIPELINE_FAILURE_SIGNATURES_2026-04-24.md` — failure modes structurate
  3. `Reports/LESSONS_INVENTORY_2026-04-24.md` — cross-ref Master lessons (L01-L49)
  4. `Reports/AUDIT_E2E_2026-04-22.md` — E2E run actual
  5. `Reports/STRATEGY_VS_IMPLEMENTATION_AUDIT_2026-04-11.md` — strategie vs implementare gap
- **Plan propus** (pentru sesiune dedicată Tester):
  1. Citește cele 5 rapoarte; extrage fiecare finding distinct
  2. Categorizează: Security / Reliability / Performance / DX / Documentation
  3. Atribuie prioritate (P0/P1/P2) bazat pe impact pe consumatori (Website Guru live, e2e-audit-runner, journey-audit CLI)
  4. Pentru fiecare → adaugă G-XXX entry aici cu: descriere, files affected, risc, plan de fix, propose-confirm-apply
  5. Marchează G-001 Eliminated când triage-ul e complet
- **Why deferred**: Sesiunea curentă e Master deep-audit (Phase 3+ STALE_WIP recovery). Triage-ul Tester merită sesiune dedicată (Tester-only) ca să respecte regula NO-TOUCH "un proiect per sesiune" și să facă fiecare G-XXX cu atenție.
- **Estimat effort**: 1-2h sesiune dedicată
- **Owner**: Master orchestration (Direct mode)

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
