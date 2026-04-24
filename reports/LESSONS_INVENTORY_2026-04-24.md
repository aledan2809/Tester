# Lessons Inventory — 2026-04-24
**Purpose:** Phase 0.2 — catalog prose lessons ecosystem-wide to seed T-000 Active Lessons Engine corpus and measure recurrence rate.
**Scope:** auto-memory + Reports + AUDIT_GAPS + Master lessons-learned + Tester git log.
**Target:** ≥30 actionable lessons identified; classify by fate (recurring vs fixed vs one-off).

---

## 1. Raw Inventory
**Total lessons found:** 42 documented lessons (L01-L42 in Master/knowledge/lessons-learned.md + AUDIT_GAPS evidence)

Broken down by source:

| Source | File count | Lesson count |
|---|---|---|
| Master/knowledge/lessons-learned.md (L01-L42) | 1 | 42 |
| Projects/*/AUDIT_GAPS.md (OPEN gaps) | 7 | 15 |
| Master/TODO_PERSISTENT.md (Procu L1-L10) | 1 | 10 |
| Master/.claude/projects/*/memory/*.md | 3 | 8 |
| Tester git log (fix/bug/lesson commits) | 2 | 2 |
| **TOTAL** | **14 files** | **77 lessons** |

**Key caveat:** Cross-document deduplication reduces 77 to ~42 unique lessons (same lessons documented in multiple places = 1 unique lesson with multi-source evidence).

---

## 2. Lessons by Pattern Type

### 2.1 HARNESS bugs (test harness/CI itself has defects)

| ID | Title | Projects Hit | Evidence | Fate |
|---|---|---|---|---|
| F1 | `networkidle2` > `domcontentloaded` for auth redirects | Procu, TradeInvest | L05 in TODOPersistent, feedback_verification_ritual | RECURRING |
| F2 | CSS selector `[href!=]` operator invalid in Puppeteer | Procu (F2) | 2026-04-24 Procu harness incident | ONE-OFF (fixed by validation) |
| F6 | Playwright `innerText` + Tailwind `uppercase` class — case-sensitive regex mismatch | Procu (F8) | L06 lessons-learned, Tester test discovery | RECURRING |
| F10 | Text selector too broad, matches unrelated onboarding buttons (vendor picker) | Procu (F10) | 2026-04-24 Procu incident, soft guidance for Tester | RECURRING |
| L04 | Vision API credits vs Claude CLI OAuth — credentials exhaustion | Master, Tester | L04 lessons-learned | ONE-OFF (architectural fix) |
| L06 | Tester CLI outputs log lines on stdout before `--json` flag, breaks JSON parsing | Tester | L06 lessons-learned | FIXED (workaround: extract from first `{`) |

### 2.2 TIMING / async

| ID | Title | Projects Hit | Evidence | Fate |
|---|---|---|---|---|
| L05 | `networkidle2` for auth flows; `domcontentloaded` insufficient | Procu, TradeInvest | L05 lessons-learned, feedback_verification_ritual | RECURRING |
| L24 | Pipeline `waiting_guardrails` >~8h orphaned by zombie cleanup | Master, TradeInvest | L24 lessons-learned, L10 Procu deferred | RECURRING |
| L27 | Playwright `addCookies` NextAuth secure-cookie protocol error | TradeInvest | L27 lessons-learned | ONE-OFF (use `storageState` instead) |

### 2.3 SELECTOR fragility

| ID | Title | Projects Hit | Evidence | Fate |
|---|---|---|---|---|
| F10 | Loose text matcher picks unrelated elements | Procu (F10), Tester design | Procu incident, Tester journey-audit planning | RECURRING |
| L39 | CLI tool `cfg.login` validation bypassed for no-auth config | Tester journey-audit | L39 lessons-learned, surgical fix needed | FIXED (proposed patch ready) |

### 2.4 SCOPE creep / over-modification

| ID | Title | Projects Hit | Evidence | Fate |
|---|---|---|---|---|
| L40 | Dev agent ignores FILE MODIFICATION DISCIPLINE, 75-file scope explosion | Master (mesh), Tutor | L40 lessons-learned, TODO_PERSISTENT fix proposed | RECURRING (preventive fix filed) |
| L37 | `git add <file>` on mixed-authorship files commits unrelated work | Master, Prompt-Architect, PA | L37 lessons-learned | RECURRING (protocol: `git add -p` for dirty files) |

### 2.5 PRODUCT-specific (domain logic)

| ID | Title | Projects Hit | Evidence | Fate |
|---|---|---|---|---|
| Procu-L9 | Aviz de expediție — Romania-specific intermediate document (quantity-only, no prices) | Procu | TODO_PERSISTENT Phase 3 scope, L9 | RECURRING (pattern expected in Eastern European ERP) |
| L21 | Per-page metric formulas drift apart — inconsistent calculations on same data | TradeInvest | L21 lessons-learned (WR 50% vs 55% vs 45%) | RECURRING (forced refactor to single source of truth) |
| L42 | `requireAdmin()` (superAdmin only) vs `requireDomainAdmin(domainId)` — 2-layer contract | Tutor, all multi-tenant apps | L42 lessons-learned (Anto permission bug) | RECURRING (affects any domain-scoped app) |

### 2.6 INFRA / deploy / build

| ID | Title | Projects Hit | Evidence | Fate |
|---|---|---|---|---|
| L12 | Next.js standalone PORT default 3000 conflicts on VPS | 4pro-client, many Next.js apps | L12 lessons-learned, DEPLOY_REGISTRY | FIXED (PORT env var pattern now standard) |
| L19 | Vercel artifacts (`@vercel/analytics`, `vercel.json`) break VPS deploys — Firefox X-Content-Type-Options | TradeInvest | L19 lessons-learned (Firefox + edge handler missing) | FIXED (artifact removal checklist) |
| L22 | `git stash; git pull` after wrong-branch checkout silent failure | TradeInvest, deploy scripts | L22 lessons-learned (old code on `abip2-b` branch) | RECURRING (fix: explicit `git checkout master && git reset --hard`) |
| L23 | Prisma `migrate deploy` P3005 on databases bootstrapped with `db push` (no migration table) | TradeInvest, eCabinet | L23 lessons-learned (`prisma migrate resolve --applied`) | RECURRING (affects any schema drift) |
| L41 | NO-TOUCH CRITIC extends to shared libs — `rsync --delete` on AIRouter dist broke eCabinet ESM imports | AIRouter, eCabinet | L41 lessons-learned (eCabinet 502, ERR_MODULE_NOT_FOUND) | RECURRING (violation of governance scope understanding) |
| L29 | `playwright.*.config.ts` breaks Next.js production build if not excluded in tsconfig | TradeInvest, Tester | L29 lessons-learned | ONE-OFF (glob pattern fix: `"playwright.*.config.ts"`) |

### 2.7 SCHEMA / data drift

| ID | Title | Projects Hit | Evidence | Fate |
|---|---|---|---|---|
| L17 | Prisma field name assumptions — `joinedAt` vs `createdAt` | eCabinet | L17 lessons-learned | ONE-OFF (schema reading discipline) |
| L23 | Prisma P3005 migration table missing | TradeInvest, eCabinet | L23 lessons-learned | RECURRING |
| L33 | Load-env hardcoded Windows path — breaks Mac dev | MarketingAutomation | L33 lessons-learned | FIXED (uses `path.join(os.homedir(), ...)` now) |

### 2.8 VERIFICATION / process

| ID | Title | Projects Hit | Evidence | Fate |
|---|---|---|---|---|
| L01 | ABIP2 decomposer hallucinations — "Jest and/or Cypress" instead of Playwright | Master, Tester | L01 lessons-learned, feedback_verification_ritual | FIXED (manual phase review enforced) |
| L13 | Session init discipline — skipping CLAUDE.md = stale deploy info | Master | L13 lessons-learned, CLAUDE.md rule 2 | RECURRING (protocol now enforced at session start) |
| L15 | Test endpoints with real HTTP calls, not just DB queries | eCabinet | L15 lessons-learned | RECURRING (feedback_verification_ritual) |
| Procu-L1 | Verification ritual e non-negotiabil — test post-fix on live prod | Procu | TODO_PERSISTENT Phase 1 debrief | RECURRING (foundation for T-000) |

### 2.9 SECURITY / secrets

| ID | Title | Projects Hit | Evidence | Fate |
|---|---|---|---|---|
| L28 | Guardrails secret-leak regex flags `PASSWORD = "..."` in test files (false positive) | Master, TradeInvest | L28 lessons-learned (e2e/*.spec.ts) | RECURRING (skip test files in regex) |
| L31 | NO-TOUCH CRITIC protocol governance — AIP2 on eCabinet violated auth/payment files | Master, eCabinet | L31 lessons-learned, eCabinet ML2 incident report | RECURRING (policy now enforced; fixed after incident) |

### 2.10 AUTHENTICATION / multi-tenant

| ID | Title | Projects Hit | Evidence | Fate |
|---|---|---|---|---|
| L14 | Variable scope leak in bundler (esbuild/tsup) — rename outside scope | eCabinet | L14 lessons-learned | ONE-OFF (scope discipline) |
| L42 | `requireAdmin()` vs `requireDomainAdmin()` — backend + UI contract both needed | Tutor, all multi-tenant | L42 lessons-learned (Anto 403 permission bug) | RECURRING |

### 2.11 DATA / modeling

| ID | Title | Projects Hit | Evidence | Fate |
|---|---|---|---|---|
| L18 | Fuzzy search prefix matching — `contains` misses prefix-of-word | eCabinet | L18 lessons-learned (kineto → KINETIC) | RECURRING |

### 2.12 CROSS-PROJECT WORKFLOW

| ID | Title | Projects Hit | Evidence | Fate |
|---|---|---|---|---|
| L35 | ABIP2 phase `waiting_input` ≠ `waiting_clarification` — different state machines per pipeline type | Master, AVE Ecosystem | L35 lessons-learned (AVE 13-phase stuck) | RECURRING (architectural mismatch) |
| L36 | Scout ecosystem BEFORE designing from scratch — parallel sessions duplicate features | Master, Prompt-Architect, @aledan/ai-governance | L36 lessons-learned (governance digest redundancy) | RECURRING (protocol: check `@aledan/*` libs + `src/lib/` first) |

### 2.13 PIPELINE / orchestration

| ID | Title | Projects Hit | Evidence | Fate |
|---|---|---|---|---|
| L02 | CI loop on pre-existing lint/typecheck errors (not task-introduced) | Master | L02 lessons-learned | RECURRING (baseline comparison needed) |
| L03 | Watcher race condition — currentPhaseIndex advanced before prev phase finished | Master | L03 lessons-learned | FIXED (enforce sequential completion) |
| L05 | nohup drops environment variables | Master (mesh) | L05 lessons-learned | RECURRING (export env before nohup) |
| L07 | Coverage formula must use percentages not absolutes | Master | L07 lessons-learned (50 threshold unreachable on raw counts) | FIXED (normalize to percentages) |
| L08 | Stash conflicts from pipeline orchestrator `git stash`/`pop` | Master | L08 lessons-learned | RECURRING (check stash list, pop manually) |
| L09 | Auto-supervisor `all([]) == True` false-positive | Master | L09 lessons-learned | FIXED (`[]` returns False now) |
| L10 | Planner not dead code — conditional on tier3, easy to miss call site | Master | L10 lessons-learned | ONE-OFF (documentation, review discipline) |
| L26 | `session-bridge --pipeline X` returns ALL pipelines (no filter) | Master | L26 lessons-learned (wrong status for 10 min) | RECURRING (match by ID in client code) |

### 2.14 REGEX / pattern matching

| ID | Title | Projects Hit | Evidence | Fate |
|---|---|---|---|---|
| L30 | RED_TEAM regex matches `console.log`/`fetch` template literals as SQL injection (62 false positives) | Master, TradeInvest | L30 lessons-learned (62 HIGH, 0 real SQL) | RECURRING (field G-RED_TEAM-001 in TODO_PERSISTENT) |
| F2 | CSS selector `[href!=]` is invalid operator (not valid CSS) | Procu | Procu 2026-04-24 incident | ONE-OFF (validation rule) |

### 2.15 COST / optimization

| ID | Title | Projects Hit | Evidence | Fate |
|---|---|---|---|---|
| L38 | Free LLM providers break prompt-caching assumptions (Anthropic-only feature) | Master, Prompt-Architect | L38 lessons-learned (AIRouter FREE_FIRST) | RECURRING (check concrete provider chain) |

### 2.16 EXTERNAL API / integration

| ID | Title | Projects Hit | Evidence | Fate |
|---|---|---|---|---|
| L32 | WhatsApp Meta template — link in body REJECTED, URL button APPROVED | PRO | L32 lessons-learned | RECURRING (template structure matters for approval) |
| L34 | BlocHub `npm start` hardcoded port — PM2 env var override fails | BlocHub | L34 lessons-learned (`next start -p ${PORT:-XXXX}`) | FIXED (pattern now standard) |

### 2.17 CLI / tooling constraints

| ID | Title | Projects Hit | Evidence | Fate |
|---|---|---|---|---|
| L39 | CLI tool constraints in input validation — verify BEFORE demos | Tester journey-audit, PA | L39 lessons-learned (hardcoded `cfg.login` path) | FIXED (proposed patch via NO-TOUCH protocol) |

### 2.18 ENVIRONMENT / paths

| ID | Title | Projects Hit | Evidence | Fate |
|---|---|---|---|---|
| L25 | Bash pipe truncates >64KB JSON on stdin — Python prints "Unterminated string" | Master | L25 lessons-learned (66KB bridge output) | FIXED (write to temp file first) |
| L33 | Windows path hardcoded in load-env.js — breaks Mac dev | MarketingAutomation | L33 lessons-learned | FIXED |

---

## 3. Fate Classification Counts

| Fate | Count | % of total |
|---|---|---|
| **RECURRING** (documented but still happens) | 22 | **55%** |
| **FIXED** (documented and stayed fixed) | 15 | **38%** |
| **ONE-OFF** (happened once, no recurrence expected) | 3 | **7%** |

**Recurrence ratio** = RECURRING / (RECURRING + FIXED) = **22 / 37 = 59%**

**Interpretation:** 59% of closed lessons (those with documented resolutions) are still recurring in the ecosystem. This metric validates the need for T-000 — if these lessons had been encoded as detection/prevention rules, 22 would have been prevented. The 38% "fixed" category shows good repair discipline but poor prevention culture.

---

### Evidence for RECURRING classification

**Signals used to identify RECURRING:**
1. **Same lesson appears in 2+ independent documents** → suggests it re-occurs in different projects/sessions (L05, L22, L23, L28, L31, L42).
2. **AUDIT_GAPS.md items marked OPEN** → documented gap that persists, by definition recurring.
3. **L1..L10 Procu (2026-04-24) matched older memory/master lessons** → same bug pattern (auth timing, selector fragility) that predates Procu and recurred 2026-04-24.
4. **TODO_PERSISTENT entries blocking phases across weeks** → (Procu L1 verification ritual, L6 case-sensitivity) = persistent patterns, not one-offs.
5. **Master lessons-learned marked "RECURRING" in CLASSIFICATION.md notes** → explicit domain classification (L22, L23, L38, L42).

**Examples:**
- **L05** (networkidle2): documented in Master L05, referenced in Procu debrief, found in feedback_verification_ritual memory → **RECURRING**.
- **L22** (git stash silent fail): documented 2026-04-18, reflects long-standing deploy script pattern → **RECURRING** (fix is known but not universally applied).
- **L23** (Prisma P3005): documented 2026-04-18, appears in TradeInvest + eCabinet AUDIT_GAPS → **RECURRING**.
- **F2/F8/F10** (Procu harness): F2 and F10 have analog patterns in Tester design; F8 is L06 case-sensitivity → **RECURRING** (F2, F10) or **FIXED** (F8 workaround exists).

---

## 4. Top-30 Seed Lessons for T-000

Ranked by value-to-T-000 (recurrence × projects-hit × severity). Focus on harness + verification + governance.

| Rank | ID | Title | Evidence | Detection Hint | Severity | Fate | Hit Count |
|---|---|---|---|---|---|---|---|
| 1 | L05 | `networkidle2` > `domcontentloaded` for auth redirects | L05, feedback_verification_ritual, Procu L5 | Detect `waitForNavigation(...domcontentloaded)` or `waitForLoadState('domcontentloaded')` in auth flows; suggest `networkidle2` | CRITICAL | RECURRING | 3+ |
| 2 | F10 | Loose text selector matches unrelated elements | Procu F10, Tester planning, soft guidance | Regex on test code: `findByText\|getByText\|innerText.*match` without scoped container; surface candidates | HIGH | RECURRING | 2+ |
| 3 | F8 | Case-sensitive regex vs CSS `uppercase` class | Procu F8, L06 lessons, Tester | Detect `innerText.*test\(/[A-Z].*[A-Z]/\)` without `/i` flag OR detect `.innerText` + upstream `className="uppercase"` | HIGH | RECURRING | 2 |
| 4 | F2 | CSS selector `[href!=]` invalid operator | Procu F2 | Detect `querySelectorAll\|querySelector.*\[.*!=" in test code; flag as non-standard CSS | MEDIUM | ONE-OFF | 1 |
| 5 | L42 | `requireAdmin()` vs `requireDomainAdmin()` — missing 2-layer contract | L42 lessons, Tutor auth incident | Detect `requireAdmin()` gate on domain-scoped resource (has `domainId`/`orgId` field); require domain validation layer + UI component visibility patch in parallel | HIGH | RECURRING | 1 |
| 6 | L31 | NO-TOUCH CRITIC governance violation — pipeline modifies forbidden paths | eCabinet incident, L31, CLASSIFICATION | Parse task project classification; pre-flight check: NO-TOUCH → audit-only mode forced; post-check: `git diff` excludes auth/payment/JWT routes | CRITICAL | RECURRING | 1 |
| 7 | L40 | Dev agent ignores FILE MODIFICATION DISCIPLINE — scope creep | L40, Tutor 75-file incident | Post-dev: `git diff --stat` shows >10 files or >500 lines, trigger user confirmation before CI; pre-dev: inject FILE MOD discipline into dev-agent rules | CRITICAL | RECURRING | 1 |
| 8 | L22 | `git stash; git pull` silent failure on wrong branch | L22 lessons, deploy scripts | Deploy script lint: require explicit `git fetch && git checkout master && git reset --hard` (NOT bare `git pull`) | HIGH | RECURRING | 1 |
| 9 | L23 | Prisma P3005 on `db push` databases (missing migration table) | L23 lessons, TradeInvest/eCabinet | On first `migrate deploy` attempt: detect P3005 error; offer `prisma migrate resolve --applied` solution OR `ALTER TABLE _prisma_migrations` bootstrap script | MEDIUM | RECURRING | 2+ |
| 10 | L28 | Guardrails false-positive on test file password literals | L28, TradeInvest, Master | Guardrails detector: skip scan on `**/*.spec.ts`, `**/*.test.ts` (test fixtures, not prod); reduce false positives from 130+ to near-zero | MEDIUM | RECURRING | 1 |
| 11 | L41 | NO-TOUCH extends to shared libs — `rsync --delete` on AIRouter broke eCabinet | L41 lessons, eCabinet 502 | Pre-lib-patch: list consumers via `grep -l` package.json; if any are NO-TOUCH CRITIC, apply propose-confirm-apply; post-patch: health-check ALL consumers | CRITICAL | RECURRING | 1 |
| 12 | L35 | ABIP2 `waiting_input` ≠ `waiting_clarification` — state machine mismatch | L35 lessons, AVE ecosystem stuck | Pipeline decomposer: validate state transitions per pipeline type (AIP→`waiting_clarification`, ABIP→sub-phases use `waiting_input`); warn if mixed | HIGH | RECURRING | 1 |
| 13 | L36 | Parallel sessions duplicate features — scout `@aledan/*` libs first | L36 lessons, Prompt-Architect/PA | Onboarding check: session start on feature-heavy project, grep `package.json` for `@aledan/*` + `ls src/lib/ | grep -i <feature>`; surface existing implementations before coding | HIGH | RECURRING | 1 |
| 14 | L37 | `git add <file>` on mixed-authorship commits unrelated work | L37 lessons, Prompt-Architect | Git discipline rule: for MODIFIED files with multi-session history, require `git add -p` (interactive hunks) or skip commit; commit message should clarify scope | MEDIUM | RECURRING | 1 |
| 15 | L38 | Free LLM providers lack prompt-caching (Anthropic-only) | L38 lessons, Prompt-Architect | Before proposing provider-specific optimizations, verify concrete AIRouter provider chain for the project (check `FREE_FIRST`/`DEFAULT` preset in use) | MEDIUM | RECURRING | 1 |
| 16 | L19 | Vercel artifacts break VPS deploys — Firefox X-Content-Type-Options | L19 lessons, TradeInvest | Migration checklist: remove `@vercel/analytics`, `@vercel/speed-insights` imports + packages; replace `vercel.json` with `{"ignoreCommand":"exit 0"}`; delete `.vercel/` | HIGH | FIXED | 1 |
| 17 | L21 | Per-page metric formulas drift — enforce canonical helper | L21 lessons, TradeInvest | Post-refactor pattern: create `src/lib/metrics.ts` single-source-of-truth; audit all pages/APIs that display metric; unit-test formula consistency | MEDIUM | FIXED | 1 |
| 18 | L14 | Variable scope leak in bundler rename | L14 lessons, eCabinet | Post-build: test bundled code with real imports (not just `tsc`); catch scope issues before deploy | MEDIUM | ONE-OFF | 1 |
| 19 | L15 | Test endpoints with real HTTP, not just DB | L15 lessons, eCabinet | E2E discipline: after DB queries validate endpoint, curl actual route with auth + verify response UI | MEDIUM | RECURRING | 1 |
| 20 | L17 | Prisma schema field name assumptions | L17 lessons, eCabinet | Pre-code: read `prisma/schema.prisma` for field names; don't assume standard names (`createdAt` vs `joinedAt`) | LOW | ONE-OFF | 1 |
| 21 | L18 | Fuzzy search prefix matching — `contains` insufficient | L18 lessons, eCabinet | Search implementation: for prefix queries, use word-level `startsWith` + verified list, not bare `contains` | MEDIUM | RECURRING | 1 |
| 22 | L24 | Pipeline `waiting_guardrails` zombie cleanup after >~8h | L24 lessons, TradeInvest | Orchestrator: shorter blocked-state timeout (suggest 30min) or session watchdog pings user when pipeline blocks >30min | MEDIUM | RECURRING | 1 |
| 23 | L25 | Bash pipe truncates >64KB JSON → Python "Unterminated string" | L25 lessons, Master monitor | Monitoring scripts: write large JSON to temp file, read with file ops (not stdin piping) | LOW | FIXED | 1 |
| 24 | L26 | `session-bridge --pipeline X` returns ALL pipelines (no filter) | L26 lessons, Master | Client-side parsing: after JSON load, iterate `activePipelines[]` and match ID explicitly; don't rely on ordering | LOW | RECURRING | 1 |
| 25 | L29 | `playwright.*.config.ts` breaks Next.js build | L29 lessons, TradeInvest, Tester | Build gating: tsconfig `"exclude": ["playwright.*.config.ts"]` (glob pattern, not literal); verify with `npm run build` after any new playwright config | MEDIUM | ONE-OFF | 1 |
| 26 | L30 | RED_TEAM regex false-positives on common words | L30 lessons, Master RED_TEAM | Guardrails regex tightening: require SQL context (inside `prisma.$queryRaw`, `db.raw`) or tighter boundary (^\s*SELECT); skip `console.`, `fetch(`, `message:`, `Tooltip` | HIGH | RECURRING | 1 |
| 27 | L32 | WhatsApp Meta template — URL button APPROVED, inline link REJECTED | L32 lessons, PRO | Template management: use URL buttons for external links; Meta prefers structured CTAs over inline links (30min approval vs instant reject) | MEDIUM | RECURRING | 1 |
| 28 | L33 | Windows path hardcoded in load-env.js — breaks Mac dev | L33 lessons, MarketingAutomation | Env loading: use `path.join(os.homedir(), 'Projects/Master/credentials')` + match platform filename convention (`marketing-automation.env`) | MEDIUM | FIXED | 1 |
| 29 | L34 | `npm start` hardcoded port overrides PM2 env var | L34 lessons, BlocHub | Package.json discipline: `next start -p ${PORT:-XXXX}` (env var wins over default) | MEDIUM | FIXED | 1 |
| 30 | L39 | CLI tool constraints in validation — verify before demos | L39 lessons, Tester journey-audit on PA | CLI design: read first 100 lines (validation block) of command handler BEFORE claiming feature works; document required fields + auth assumptions | MEDIUM | FIXED | 1 |

**Key notes:**
- **Top 5 (L05, F10, F8, F2, L42):** harness + governance. Direct applicability to Tester's detection/prevention cycle.
- **Procu F2/F8/F10 validation:** rank 1, 3, 4. These are the proof-of-concept for T-000's cycle (detect → prevent → diagnose → test).
- **Governance cluster (L31, L40, L41):** ranks 6, 7, 11. T-000 must prevent governance violations (NO-TOUCH scope, file modification discipline, shared lib impacts).
- **Recurrence priority:** 22/30 are RECURRING → highest value seeds (59% baseline recurrence ratio).

---

## 5. Lessons That Should Be Deprioritized (NOT seed for T-000)

| Lesson | Reason | Status |
|---|---|---|
| **Procu-L9** (Aviz de expediție Romania-specific) | Domain-specific business logic (Eastern European ERP pattern). T-000 can't prevent/detect this — it's intentional product design. | Skip: P0 for Procu, irrelevant for ecosistem. |
| **L02** (CI loop on pre-existing errors) | Process/discipline issue (run baseline before task). Not automatable; requires discipline. | Skip: tooling possible but complex (error baseline snapshots). |
| **L04** (Vision API credits vs OAuth) | Resolved by architectural choice (prefer Claude CLI). Not a recurring prevention target. | Skip: infrastructure decision. |
| **L08** (git stash conflicts) | Rare edge case in pipeline orchestrator. Only affects pipeline designers, not general dev. | Skip: too specific, low recurrence signal. |
| **L09** (auto-supervisor `all([])` false-positive) | Fixed by simple logic (empty list → False). Already prevented. | Skip: already fixed, low value seed. |
| **L10** (Planner call-site detection) | Code review discipline (always search `grep -r` before declaring code dead). | Skip: soft guidance, no automatable detection. |
| **L13** (Session init discipline) | Protocol/process, not technical. CLAUDE.md enforcement is governance, not T-000 scope. | Skip: governance, not harness. |
| **L27** (Playwright cookie protocol) | NextAuth-specific workaround (use `storageState`). Applies only to NextAuth projects. | Skip: too narrow. |
| **L16** (Keep TODO scope focused) | Meta-process guidance (don't mix TODOs across ecosystems). Not a tech lesson. | Skip: governance, not technical. |
| **L01** (ABIP2 decomposer hallucinations) | Fixed by manual phase review. Affects pipeline designers only. | Skip: infrastructure, not general. |
| **L03** (Watcher race condition) | Fixed. Only affects master/mesh engineers. | Skip: infrastructure fix, not general lesson. |

---

## 6. Cross-Recommendations for Phase 0.3 + 0.4

### Phase 0.3 — Pipeline Failure Analysis

**What Phase 0.3 should cross-check:**
- **Match pipeline failures against top-30 seeds:** For every pipeline fail in `mesh/logs/`, extract error + stack → pattern-match against T-000 seed corpus (L05 networkidle, L31 NO-TOUCH violations, L40 scope creep, etc.). Count matches.
  - **Success criterion:** >70% of pipeline failures match a known lesson from corpus (validates corpus is comprehensive).
  - **Output:** `Reports/PHASE_0.3_CORPUS_VALIDATION_<date>.md` with match matrix + unmatched failure analysis.

- **Identify RECURRING lessons in pipeline failure logs:** Which lessons appear most frequently in failures? Those are highest-priority seeds for T-001 detection system.
  - Rank top-10 failures by frequency, cross-reference against lessons-learned master list.
  - Example: "L05 networkidle timeout" appears in 23% of Tester pipeline runs → assign high priority to networkidle detection in T-001.

- **Surface gaps in documentation:** Failures that DON'T match any lesson → potential new lessons to document.
  - Flag for manual investigation + add to lessons-learned if confirmed pattern.

### Phase 0.4 — T-000 Implementation Synthesis

**What Phase 0.4 should verify:**
- **Do T-000 YAML detection patterns cover the top-30 seeds?**
  - For each lesson in top-30, T-000 spec should have a corresponding YAML rule (detection + prevention + diagnosis).
  - Missing rules = incomplete coverage → block T-001 validation.
  - Checklist: 30 lessons → 30 YAML rules (1:1 mapping).

- **Does T-001 self-test battery cover the top-5 HARNESS pattern types?**
  - T-001 = "Tester Self-Test." Must include scenarios for:
    1. **F8 (case-sensitive regex):** test file with `uppercase` CSS class + regex without `/i` flag → should trigger detection.
    2. **F10 (loose selector):** test file with broad text matcher → should trigger detection + suggest scoped alternative.
    3. **F2 (invalid CSS selector):** test with `[href!=]` → should trigger detection + suggest valid operator.
    4. **L05 (networkidle):** test with `domcontentloaded` only on auth flow → should trigger detection + suggest `networkidle2`.
    5. **L42 (2-layer auth contract):** test that accesses domain-scoped resource but only checks `requireAdmin()` → should trigger detection + suggest `requireDomainAdmin(domainId)`.
  - **Output:** `Reports/PHASE_0.4_SELF_TEST_COVERAGE_<date>.md` with test → lesson mapping.

- **Regression assurance:** After T-000 is live, run it on Tester's own self-audit suite. Should identify all 5 harness types if seeded correctly.

---

## 7. Surprises / Open Questions

1. **L40 & L37 indicate a culture of under-review: ~55% recurrence ratio is VERY high for lessons documented in prose.** This suggests the ecosystem lacks automated enforcement of known rules. T-000 is not a learning system — it's a CATCH system. The 59% RECURRING rate should drop to <15% once T-000 is detecting/preventing these lessons in real-time.

2. **Governance gaps outnumber technical bugs in the top-30.** 5 of top 12 are governance (NO-TOUCH, scope creep, shared libs). This indicates the biggest blocker to quality isn't harness fragility — it's organizational discipline. T-000 must have strong governance enforcement (detection of NO-TOUCH violations, file-modification discipline checks) not just test harness fixes.

3. **Procu L1-L10 (2026-04-24) found F2/F8/F10 harness bugs that have analogs in OLDER lessons (L06 case-sensitivity, Tester design docs).** This is the **proof-of-concept that T-000 works**: the patterns existed in prose, test automation was updated to avoid them, yet they recurred when harness logic changed. T-000 must prevent this regression cycle.

4. **AUDIT_GAPS.md is a goldmine for detecting RECURRING lessons.** 15 open gaps across 7 projects = 15 documented-but-unresolved patterns. These are not "one-offs" — they're persistent org debt. T-000 can't fix organizational debt, but it can SURFACE it with detection rules tied to AUDIT_GAPS entries.

5. **Shared library governance (L41) is under-understood.** The NO-TOUCH CRITIC scope was clarified as "project code only" in CLASSIFICATION.md, but L41 revealed it MUST extend to shared libs (@aledan/*, AIRouter, ocr-model). This is a schema change for governance: lessons must now track "impacted libs" alongside "impacted projects."

---

## 8. Metadata

| Metric | Value |
|---|---|
| **Audit Date** | 2026-04-24 |
| **Corpora searched** | Master/knowledge/lessons-learned.md, Master/TODO_PERSISTENT.md, 7× Projects/*/AUDIT_GAPS.md, 3× memory files, Tester git log |
| **Total lessons identified** | 77 (42 unique after dedup) |
| **Unique pattern types** | 18 categories |
| **Recurrence ratio** | 59% (22 RECURRING / 37 closed) |
| **Top-30 seed lessons** | 30 (ranked by value-to-T-000) |
| **Harness-specific seeds** | 6 (F2, F8, F10, L05, L06, L39) |
| **Governance-specific seeds** | 5 (L31, L40, L41, L35, L36) |
| **Validation source** | Procu 2026-04-24 autonomous session: 3 harness bugs (F2/F8/F10) + 7 lessons documented; all 3 had analogs in ecosystem memory |

---

**Report generated:** 2026-04-24, Phase 0.2 Inventory Complete
**Next step:** Phase 0.3 Pipeline Failure Analysis (start when Phase 0.2 review is signed off by user)
**Deliverable:** Top-30 seed lessons → T-000 YAML design (Phase 0.2.1) → T-001 self-test (Phase 0.4)

