# @aledan007/tester — Capabilities Reference

> **Version**: 0.4.0 (npm published) | Modules A–M + 19-step E2E Full Audit  
> **Deploy**: `tester.techbiz.ae` (VPS1, port 3012)  
> **Ultima actualizare**: 2026-05-07

---

## Cuprins

1. [Motor de bază](#1-motor-de-baza)
2. [Discovery — BFS Crawler](#2-discovery--bfs-crawler)
3. [Autentificare](#3-autentificare)
4. [Assertion Engine](#4-assertion-engine)
5. [Modules A–M (Upgrade Pack)](#5-modules-am-upgrade-pack)
6. [CLI Commands](#6-cli-commands)
7. [HTTP Server API](#7-http-server-api)
8. [Journey Audit](#8-journey-audit)
9. [Stabilitate API](#9-stabilitate-api)

---

## 1. Motor de bază

Tester este un engine de testare web AI-powered. Procesul standard:

```
BFS Crawl → Page Analysis → AI Scenario Generation → Assertion Execution → Report
```

### `AITester` (clasa principală)

- Acceptă `TesterConfig` (URL, credentials, headless, timeout, max pages etc.)
- Orchestrează toate componentele de mai jos
- Output: `TestRun` cu `TestSummary` + lista de `ScenarioResult`

### `BrowserCore`

- Wrapper peste Puppeteer
- Gestionează lifecycle browser (launch, page pool, cleanup)
- Suportă headless și headed mode

### Element Finder (AI Vision)

- `findElementByVision(page, intent, screenshot)` — localizează elemente UI din screenshot via Claude Vision (Sonnet 4.5)
- 3-tier resolution: CSS selector → fallback → AI Vision
- Utilizat când selectoarele standard eșuează (modal dinamic, element obscured)

### Safety Guards

- `isDomainAllowed` — whitelist domenii pentru a preveni navigația accidentală afară din target
- `shouldSkipUrl` — filtrează URLs (assets, logout, external)
- `createTimeoutGuard` — wraps operații async cu timeout configurat
- `validateStep` / `validateSteps` — validare structurală a pașilor de test înainte de execuție

---

## 2. Discovery — BFS Crawler

### `crawlSite(baseUrl, options)`

- BFS complet pe site-ul target: urmărește linkuri, form actions, nav menus
- Deduplicare URLs, respectă `maxPages` și `maxDepth`
- Returnează `SiteMap` cu toate paginile descoperite + metadata (forms, buttons, links, inputs per pagină)

### `analyzePage(page)`

- Extrage structura DOM a paginii: `DiscoveredForm[]`, `DiscoveredButton[]`, `DiscoveredLink[]`, `DiscoveredInput[]`
- Identifică câmpuri de input (name, type, id, placeholder)
- Baza pentru generarea de scenarii și form audit

### `buildSiteMap` / `formatSiteMapSummary`

- Construiește o hartă completă a site-ului
- Formatare human-readable pentru rapoarte

---

## 3. Autentificare

### `autoLogin(page, url, credentials)`

- Detectează automat tipul de login (WordPress, Shopify, Wix, Squarespace, generic HTML form)
- Completează și trimite formularul de autentificare
- Suportă `LoginPlan` (selectoare custom dacă auto-detect eșuează)

### MFA / TOTP

- `detectMfa(page)` — detectează step-ul de 2FA după login
- `handleMfa(page, handler)` — execută handler-ul MFA (TOTP, SMS, backup code)
- `createCliMfaHandler()` — prompt interactiv CLI pentru cod MFA manual

### Session Persistence

- `saveSession(page, path)` — salvează cookies + localStorage după autentificare
- `loadSession(page, path)` — restaurează sesiunea salvată (evită re-login)
- `isSessionValid(page)` — verifică dacă sesiunea curentă e validă (nu a expirat)

---

## 4. Assertion Engine

Toate assertionurile sunt additive față de motorul existent. Nu modifică BFS sau reporter.

### DOM Assertions — `runDomAssertion(page, assertion)`

Tipuri suportate (`AssertionType`):
- `elementExists` / `elementVisible` / `elementNotExists`
- `textContent` — verifică text în element
- `attributeValue` — verifică valoarea unui atribut
- `formSubmits` — testează că form-ul se trimite și primește răspuns
- `noConsoleErrors` — zero erori în console
- `noNetworkErrors` — zero request-uri eșuate
- `auditLoadTiming` — (Module G) timpi de încărcare: TTFB, DOMContentLoaded, Load, FCP, LCP
- `auditHydrationAndCSP` — (Module J) detectează erori de hidratare React/Next.js + violări CSP în console

### Network Assertions — `runNetworkAssertion(page, assertion)`

- `statusCode` — verifică HTTP status al unui endpoint
- `responseTime` — verifică că răspunsul vine sub un threshold
- `responseBodyContains` — verifică conținut în body

### Visual Assertions — `runVisualAssertion(page, assertion)`

- `screenshotMatch` — compară screenshot cu baseline (pixelmatch)
- `noLayoutShift` — detectează Cumulative Layout Shift (CLS)

### A11y Assertions — `runA11yScan(page, options)`

- Rulează axe-core pe pagina curentă
- Returnează violări per nivel: critical, serious, moderate, minor
- `runAllA11y(pages, options)` — batch scan pe multiple pagini

### Performance Assertions — `capturePerformanceMetrics(page)`

- Capturează: LCP, FCP, TTI, CLS, TBT, TTFB
- `runLighthouse(url)` / `runLighthouseMulti(urls)` — audit Lighthouse complet
- `evaluatePerfBudget(metrics, budget)` — compară cu budget configurat

---

## 5. Modules A–M (Upgrade Pack)

Adăugate în commiturile `9112840` + `6f9880a`. Live pe VPS1, nepublicate pe npm.

### Module A — Project Registry (`src/registry/store.ts`)

SQLite store pentru configurare multi-proiect.

```ts
const registry = new ProjectRegistry('./tester.db')
registry.register({ id: 'wg', name: 'Website Guru', baseUrl: 'https://guru.techbiz.ae' })
registry.get('wg')         // → ProjectEntry
registry.list()            // → ProjectEntry[]
registry.updateAuditResult('wg', { score: 95, verdict: 'PASS' })
```

- Câmpuri: `id`, `name`, `baseUrl`, `credentialsKey`, `tags[]`, `lastAuditAt`, `lastScore`, `lastVerdict`, `config`
- DB: better-sqlite3, același engine ca job persistence core

### Module B — Credentials Manager (`src/credentials/store.ts`)

Store de credențiale criptat AES-256-GCM, role-based.

```ts
const creds = new CredentialsManager('./creds.db', process.env.TESTER_CREDENTIALS_KEY)
creds.store('wg', 'admin', { email: 'admin@wg.com', password: 'secret' })
creds.get('wg', 'admin')   // → CredentialEntry (decriptat la runtime)
creds.list('wg')           // → CredentialEntry[] (fără plaintext passwords)
```

- Roles: `admin`, `user`, `readonly`, orice string custom
- Cheia de criptare: din `TESTER_CREDENTIALS_KEY` env var; fără cheie → stored cu warning (dev-only)
- Niciodată plaintext pe disk

### Module F — Auth Audit (`src/auth/audit.ts`)

Auditează calitatea implementării autentificării.

```ts
const result = await runAuthAudit(page, 'https://guru.techbiz.ae', {
  loginPath: '/login',
  privatePath: '/dashboard',
  credentials: { email: '...', password: '...' }
})
// result.findings: AuthFinding[] — cookie attrs, logout, session refresh
```

**Ce verifică:**
- `auditCookieAttributes(page)` — HttpOnly, Secure, SameSite, Path, Domain pe fiecare cookie de sesiune
- `auditLogout(page, logoutPath)` — post-logout nu mai poate accesa rute private
- `auditSessionRefresh(page)` — token-ul se reînnoiește înainte de expirare
- Probe pe rute private: redirect la login sau 401, niciodată 200 fără sesiune

### Module G — Load Timing (`src/assertions/dom.ts` — export adițional)

```ts
const timing = await auditLoadTiming(page, 'https://guru.techbiz.ae')
// timing.ttfbMs, timing.domContentLoadedMs, timing.loadMs, timing.fcpMs, timing.lcpMs
```

Praguri default: TTFB < 800ms, FCP < 2500ms, LCP < 4000ms. Configurabile.

### Module J — Hydration + CSP (`src/assertions/dom.ts` — export adițional)

```ts
const result = await auditHydrationAndCSP(page, 'https://guru.techbiz.ae')
// result.hydrationErrors: string[]    — erori React/Next.js "did not match"
// result.cspViolations: string[]      — violări Content-Security-Policy din console
// result.passed: boolean
```

- Interceptează console errors cu `page.on('console', namedHandler)` ÎNAINTE de navigație (lecție L5)
- Named handler + `page.off()` după — fără accumulation în TWG loop

### Module H — Form Audit (`src/assertions/forms.ts`)

Fuzzing complet pe formulare cu 12 payload-uri de type confusion.

```ts
const result = await runFormAudit(page, 'https://guru.techbiz.ae/register', options)
// result.findings: FormFinding[] — câmpuri vulnerabile, payloads acceptate
```

**`TYPE_CONFUSION_PAYLOADS`** (12 payload-uri):
- SQL injection (`' OR 1=1 --`)
- XSS (`<script>alert(1)</script>`, `javascript:alert(1)`)
- Unicode / null bytes / overlong strings
- Boolean strings (`true`, `null`, `undefined`)
- Numeric overflow (`9999999999999999`)
- Array notation (`field[]`)

**`auditDuplicateSubmit(page, formSelector)`** — detectează dacă dublu-click pe submit trimite de 2 ori.

**`safeTestData(fields)`** — generează date de test safe (non-destructive) pentru câmpuri reale.

### Module I — Security Assertions (`src/assertions/security.ts`)

5 categorii de verificări de securitate.

```ts
const audit = await runSecurityAudit(page, 'https://guru.techbiz.ae', {
  skip: ['content_type']  // opțional — skip anumite categorii
})
// audit.passed, audit.findings: SecurityFinding[], audit.durationMs
```

**`auditSecurityHeaders(page, url)`**
- Verifică prezența: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
- Verifică absența: `X-Powered-By`, `Server`, `X-ASPNet-Version` (information disclosure)
- Detectează conflict `X-Frame-Options` + `CSP frame-ancestors` (redundanță)

**`auditUnprotectedRoutes(page, baseUrl)`**
- Probe fără sesiune pe: `/dashboard`, `/admin`, `/account`, `/settings`, `/profile`, `/api/me` etc.
- Așteptat: 401, 403, sau redirect la `/login`. Flag CRITICAL pe HTTP 200.
- Curăță cookies înainte de probe (CDP `Network.clearBrowserCookies`)

**`auditApiContentType(page, baseUrl)`**
- Probe pe `/api/health`, `/api/status`, `/api/version`
- HTML response pe API route = posibil error page cu stack trace → HIGH/MEDIUM finding

**`auditMixedContent(page, url)`**
- Detectează resurse HTTP pe pagini HTTPS
- Named `onRequest` handler + `page.off()` după `goto` (lecție L5 — fără leak)

**`auditCors(page, baseUrl)`**
- Trimite request cu `Origin: https://evil.attacker-example.com`
- CRITICAL dacă `Access-Control-Allow-Origin` reflectă attacker origin + `Access-Control-Allow-Credentials: true`
- HIGH dacă reflectă fără credentials

### Module K — Playwright Recorder (`src/playwright/recorder.ts`)

Înregistrare trace + video pentru fiecare audit run.

```ts
const session = await startRecording(page, { outputDir: './artifacts', video: true })
// ... navigații și acțiuni ...
const artifacts = await session.stop()
// artifacts.tracePath, artifacts.videoPath, artifacts.screenshotPath
```

- Dynamic import al `playwright` (devDependency opțional) — dacă nu e instalat, pasul se SKIP graceful
- `recordUrl(url, options)` — one-shot: navighează + înregistrează + oprește
- `traceViewerUrl(tracePath)` — returnează URL pentru Playwright Trace Viewer

### Module M — Post-Fix Verification Gate (`src/verify/gate.ts`)

Rulează 6 straturi de verificare ÎNAINTE ca checker-ul să declare un fix ca RESOLVED.

```ts
const result = await runVerifyFixGate({
  targetUrl: 'https://guru.techbiz.ae',
  originalScenario: failingScenario,   // opțional
  smokeRoutes: ['/dashboard', '/fixes'],
  beforeScreenshot: '/tmp/before.png'  // pentru L6
})
// result.passed — true numai dacă TOATE layerele trec
// result.layers: LayerResult[]
```

**6 Layere:**
| Layer | Nume | Ce face |
|---|---|---|
| L1 | Re-run original test | Re-execută scenariul original care a eșuat |
| L2 | Regression smoke | Smoke pe 3-5 rute adiacente (verifică că fix-ul nu a rupt altceva) |
| L3 | Static diff | `tsc --noEmit` + `eslint` pe fișierele modificate (dacă accesibile) |
| L4 | Security scan | `runSecurityAudit` pe URL-ul fix-ului (headers, CORS, rute neprotejate) |
| L5 | Console + network | Capturează erori console + request-uri eșuate post-fix (listeners ÎNAINTE de navigație, named handlers, `page.off()` după) |
| L6 | Visual diff | pixelmatch between screenshot pre-fix și post-fix; `existsSync` guard înainte de `readFileSync` |

**HTTP endpoint**: `POST /api/test/verify-fix` — checker-ul apelează asta după ce Guru returnează APPLIED.

---

## 6. CLI Commands

Toate disponibile via `npx @aledan007/tester <command>` sau `node dist/cli/index.js <command>`.

### Audit & Discovery

| Command | Descriere |
|---|---|
| `discover <url>` | BFS crawl complet, afișează SiteMap |
| `run <url>` | Rulează audit complet: crawl → scenarii → assertions → report |
| `audit <url>` | Audit rapid (fără crawl BFS complet) |
| `audit-only` | Validare audit-only (fără browser) pe rapoarte existente |
| `e2e-full-audit --url <url>` | **19-step** unified audit — BFS discovery, real login, infinite-load, forbidden-guard, multi-role, responsive, audit-history comparison, markdown report |
| `smoke <url>` | Smoke test rapid: navighează + verifică zero erori critice |

**`e2e-full-audit` opțiuni complete:**
```
--url <url>          URL target (obligatoriu)
--out <dir>          Director output (default: e2e-audit-results)
--headed             Browser vizibil
--email <email>      Email pentru login real (Step 4)
--password <pw>      Parola pentru login real (Step 4)
--login-url <url>    URL login custom (default: <url>/login)
--roles <json>       Multi-role audit: '[{"name":"Admin","email":"...","password":"..."}]'
--max-pages <n>      Max pages BFS discovery (default: 50)
--history            Activează comparare cu audit anterior (Step 18)
```

**Cele 19 steps:**
| # | Step | Ce face |
|---|---|---|
| 1 | BFS Discovery | crawlSite complet pe URL target |
| 2 | Public Surface | Audit pe toate paginile publice descoperite |
| 3 | Auth Audit | Logout flow, cookie attrs, token refresh |
| 4 | Real Login | autoLogin cu credențiale reale |
| 5 | Private Dashboard | Audit pagini private (gated pe loginSucceeded) |
| 6 | Form Audit | Fuzz 12 type-confusion payloads pe toate formularele |
| 7 | Console Errors | Agregare erori console din întreaga sesiune |
| 8 | Network/API Errors | Agregare request-uri eșuate din întreaga sesiune |
| 9 | Security Audit | Headers, CORS, routes neprotejate, mixed content |
| 10 | A11y Scan | axe-core pe toate paginile descoperite |
| 11 | Performance | Lighthouse/performance metrics per pagină |
| 12 | Visual Screenshots | captureFullPage pe toate paginile |
| 13 | Video + Trace | Playwright trace + video recording (dacă instalat) |
| 14 | Infinite Loading | 13 spinner/skeleton selectors, 8s wait per pagină |
| 15 | Forbidden Guard | 12 rute private testate fără autentificare |
| 16 | Multi-Role Audit | Login + crawl separat per rol (--roles) |
| 17 | Responsive Audit | desktop/tablet/mobile viewport, overflow detection |
| 18 | History Comparison | Diff față de cel mai recent run anterior |
| 19 | Final Report | JSON + Markdown cu severity/reproSteps/expected/actual/evidencePath |
| `scope-check` | Verifică dacă modificările recente au scope bloat |
| `check-test-coupling` | Detectează coupling tight între teste și implementare |

### Journey Audit

| Command | Descriere |
|---|---|
| `journey-audit` | Browser real headed, user autentificat, walk prin nav links, screenshot per pagină |

Opțiuni principale: `--email`, `--password`, `--headed`, `--config <path>`, `--project <name>`

Config resolution (prima care există):
1. `--config <path>` flag
2. `./.journey-audit.json` la root-ul proiectului
3. `--project <name>` → config packaged în `journey-audit/configs/<name>.json`

Output: `journey-audit-results/<project>/` cu screenshots full-page + `report.json`
Clasificare pagini: `OK` / `GATED` / `EMPTY` / `HAS_ERRORS` / `CRASHED`

### Lessons Engine

| Command | Descriere |
|---|---|
| `lessons scan <path>` | Scanează codul pentru pattern-uri din lessons-learned |
| `lessons diagnose <log>` | Diagnostichează un log de eroare, propune lecție relevantă |
| `lessons classify <log>` | Clasifică un log în categoria de problemă (L-type) |
| `lessons validate` | Validează structura lessons-learned.md |
| `lessons promote` | Promovează o lecție candidate la status confirmed |
| `lessons stats` | Statistici lessons: coverage, frecvență, recency |
| `lessons install-hooks` | Instalează git hooks pentru detecție automată de pattern-uri |
| `lessons import <from>` | Importă lecții din fișiere externe |
| `lessons list` | Listează toate lecțiile active |

### Performanță

| Command | Descriere |
|---|---|
| `perf` | Rulează Lighthouse pe URL configurat, evaluează față de budget |
| `perf score` | Afișează scor curent vs budget |
| `perf trend` | Trend săptămânal (week-over-week) |

### A11y

| Command | Descriere |
|---|---|
| `a11y` | Rulează axe-core scan, generează raport HTML |

### Visual Regression

| Command | Descriere |
|---|---|
| `snapshot` | Capturează baseline screenshots |
| `regression add` | Adaugă o regresie vizuală confirmată |
| `regression list` | Listează regresii active |
| `regression expire <slug>` | Marchează o regresie ca rezolvată |

### Untested & Coverage

| Command | Descriere |
|---|---|
| `untested` | Identifică fișiere modificate recent care nu au teste |
| `coverage` | Agregă coverage report din pytest/jest/vitest |
| `generate` | Generează scenarii de test AI pentru o pagină |
| `affected` | Identifică teste afectate de modificările recente (git diff) |
| `run-affected` | Rulează doar testele afectate |

### Pipeline & Session

| Command | Descriere |
|---|---|
| `pipeline-stats` | Analizează istoricul pipeline-urilor, identifică pattern-uri de eșec |
| `session start <description>` | Începe o sesiune de testare înregistrată |
| `session log` | Adaugă event la sesiunea curentă |
| `session end` | Finalizează sesiunea |
| `session last` | Afișează ultima sesiune |
| `session show <id>` | Afișează o sesiune specifică |
| `session list` | Listează toate sesiunile |

### Lifecycle Features

| Command | Descriere |
|---|---|
| `init <feature>` | Scaffold o nouă feature (directoare, fișiere template, tests skeleton) |
| `done <feature>` | Marchează o feature ca done (evaluează criterii de completare) |
| `undone <feature>` | Revocă statusul done |
| `status` | Status global al tuturor feature-urilor |
| `inventory` | Inventar complet al proiectelor auditate |
| `flake-report` | Raport despre teste instabile (flaky) |
| `triage <log>` | Clasifică un failure și propune acțiune (fix / monitor / skip) |
| `selfcheck` | Verifică sănătatea instalării Tester însuși |
| `login <url>` | Testează autentificarea pe un URL (debug helper) |
| `report <json>` | Generează raport HTML dintr-un JSON de rezultate existent |
| `zombie-scan` | Detectează procese Puppeteer/Playwright orfane (zombie) |
| `scope-check` | Verifică că modificările recente sunt în scope (guard anti-bloat) |

---

## 7. HTTP Server API

Server Express pe portul 3012 (configurabil via `TESTER_PORT`). Autentificare Bearer token (`TESTER_API_SECRET`).

### Endpoints

| Method | Path | Descriere |
|---|---|---|
| `GET` | `/api/health` | Health check — returnează `{ status: 'ok', version }` |
| `POST` | `/api/test/start` | Pornește un job de testare async; returnează `{ jobId }` |
| `GET` | `/api/test/:id/status` | Status job (pending / running / done / failed) |
| `GET` | `/api/test/:id/results` | Rezultate complete job |
| `GET` | `/api/test/:id/report` | Raport HTML (sau JSON cu `?format=json`) |
| `POST` | `/api/auth/login` | Testează autentificarea pe un URL extern |
| `GET` | `/api/auth/validate` | Validează Bearer token curent |
| `POST` | `/api/test/verify-fix` | **[NOU — Module M]** Post-Fix Verification Gate (6 layere) |

### `POST /api/test/verify-fix`

```json
{
  "targetUrl": "https://guru.techbiz.ae",
  "smokeRoutes": ["/dashboard", "/fixes"],
  "beforeScreenshot": "/tmp/before-fix.png",
  "originalScenario": { ... }
}
```

Răspuns:
```json
{
  "passed": true,
  "layers": [
    { "layer": 1, "name": "Re-run original test", "passed": true, "durationMs": 1200, "details": "..." },
    ...
  ],
  "durationMs": 8500
}
```

Utilizat de `@aledan007/checker` după ce Website Guru raportează `APPLIED` — gate OBLIGATORIU înainte de `RESOLVED`.

---

## 8. Journey Audit

Sistem dedicat pentru audit UI real cu browser headed, utilizator autentificat.

### Flux

```
Config resolution → Login (Puppeteer) → Walk nav links → Screenshot full-page → Clasificare → report.json
```

### Clasificare pagini

| Status | Semnificație |
|---|---|
| `OK` | Pagină funcțională, conținut valid, zero erori critice |
| `GATED` | Pagina cere acțiune suplimentară (onboarding, upgrade, confirmare) |
| `EMPTY` | Pagina se încarcă dar nu are conținut (empty state, zero data) |
| `HAS_ERRORS` | Erori vizibile în UI sau în console |
| `CRASHED` | Navigarea a eșuat (timeout, 5xx, pagina nu s-a încărcat) |

### Config `.journey-audit.json`

```json
{
  "baseUrl": "https://guru.techbiz.ae",
  "loginPath": "/login",
  "emailField": "#email",
  "passwordField": "#password",
  "submitSelector": "button[type=submit]",
  "successUrlPattern": "/dashboard",
  "navLinks": [
    { "path": "/dashboard", "label": "Dashboard" },
    { "path": "/fixes", "label": "Fix Requests" }
  ],
  "waitAfterNav": 2000,
  "headed": false
}
```

### Computer-Use Fallback (G-CU-001, opt-in)

Când CSS selectors eșuează (modal dinamic, element obscurit):
- `TESTER_COMPUTER_USE_FALLBACK=1` activează fallback via Claude Vision (Sonnet 4.5+)
- Beta `computer-use-2025-01-24`
- Cost: ~$0.05-0.15 per fallback attempt
- maxTurns: 6

---

## 9. Stabilitate API

Conform `src/index.ts` (T-D2 API Contract):

| Tier | Conținut | Garanție |
|---|---|---|
| **TIER 1** | CLI commands + flags, `AITester`, assertion runners, toate `type` exports | Semver-locked — breaking changes → major bump |
| **TIER 2** | Lessons engine, Wave 1+2 helpers (untested, snapshot, a11y baseline, perf, scaffolder, session, scoring, regression, triage, affected, pipeline-stats, done gate), Modules A–M | Minor-mutable — breaking changes → minor bump + changelog |
| **TIER 3** | `src/server/**` HTTP surface (se va muta în `@aledan007/tester-service`), internals lessons scanner | Poate rupe oricând — nu importa direct |

---

## Env Vars

| Var | Obligatoriu | Descriere |
|---|---|---|
| `ANTHROPIC_API_KEY` | Da | Claude API key (scenario generation, element finder, computer-use) |
| `TESTER_API_SECRET` | Da (server) | Bearer token pentru HTTP API |
| `TESTER_PORT` | Nu (default 3012) | Port HTTP server |
| `TESTER_CREDENTIALS_KEY` | Nu | Cheie criptare pentru Credentials Manager (Module B) |
| `TESTER_COMPUTER_USE_FALLBACK` | Nu (default off) | Activează Computer Use fallback în journey audit |
| `JOURNEY_EMAIL` / `JOURNEY_PASSWORD` | Nu | Credențiale journey audit (alternativă la `--email`/`--password` flags) |

---

## Build

```bash
npm run build      # tsup (CJS + ESM + DTS)
npm test           # Vitest (85 unit tests)
npm run test:e2e   # Playwright (147 E2E tests)
npm start          # HTTP server pe TESTER_PORT
```

Stack: Node.js, TypeScript, Puppeteer, Express, tsup, better-sqlite3, axe-core, pixelmatch
