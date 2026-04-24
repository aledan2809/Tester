# AUDIT_GAPS.md — Tester (NO-TOUCH CRITIC)

**Audit Mode:** AUDIT-ONLY (read-only, no system modifications)
**Project:** @aledan/tester v0.1.0
**Date:** 2026-04-16
**Auditor:** ML2 Wave 2 — NO-TOUCH CRITIC (AVE Ecosystem #4)
**Commit:** 63c7b130aa41626fa7ee0eeab1e28c36d3be6fd7
**Validator:** AUDIT-ONLY enforced — zero writes to DB, FS, or API

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 4 |
| HIGH | 14 |
| MEDIUM | 21 |
| LOW | 10 |
| **Total** | **49** |

> Supplemental findings AUDIT-2026-045..049 added 2026-04-22 from E2E verification (see Findings tail).

---

## Findings

### ![CRITICAL] AUDIT-2026-001 — Arbitrary JavaScript execution via evaluate step action

- **Severity:** `CRITICAL`
- **Location:** `src/core/browser.ts:363`
- **Description:** page.evaluate() executes arbitrary JS in browser context. Blocklist in safety.ts is bypassable via string concatenation, template literals, and indirect references.
- **Suggestion:** Remove evaluate action or implement AST-based allowlist. Sandbox evaluate calls.

---

### ![CRITICAL] AUDIT-2026-002 — SSRF via unvalidated callback URL

- **Severity:** `CRITICAL`
- **Location:** `src/server/index.ts:438`
- **Description:** User-controlled URL passed directly to fetch() without validation. Enables SSRF to internal services, cloud metadata endpoints, and localhost.
- **Suggestion:** Validate URLs against allowlist. Block RFC 1918, link-local, loopback, cloud metadata.

---

### ![CRITICAL] AUDIT-2026-003 — API authentication bypass in dev mode

- **Severity:** `CRITICAL`
- **Location:** `src/server/middleware.ts:21`
- **Description:** When TESTER_API_SECRET is unset, ALL endpoints are publicly accessible including browser launch and credential processing endpoints.
- **Suggestion:** Fail closed: refuse to start without TESTER_API_SECRET in production. Restrict to localhost-only when no secret configured.

---

### ![CRITICAL] AUDIT-2026-004 — Exposed API key in .env file

- **Severity:** `CRITICAL`
- **Location:** `.env (line 1)`
- **Description:** A real Anthropic API key (sk-ant-api03-...) exists in the .env file on disk. If accidentally committed, shared, or leaked via backup, this enables unauthorized API usage.
- **Suggestion:** Rotate the API key immediately. Verify .env is in .gitignore. Use secrets manager for production.

---

### AUDIT-2026-005 — Element finder and auth modules untested

- **Severity:** `HIGH`
- **Location:** `src/auth/login.ts:26`
- **Description:** Element finder, auto-login, and MFA handler have no meaningful tests. Element finder lacks confidence threshold validation.
- **Suggestion:** Create test suites with mocked API responses. Add MFA code format validation.

---

### AUDIT-2026-006 — Credentials logged/stored in plaintext

- **Severity:** `HIGH`
- **Location:** `src/auth/session.ts:14`
- **Description:** Session cookies stored as plaintext JSON. Raw username passed to createSession. Credentials exist in request logs and heap without scrubbing.
- **Suggestion:** Never log credential bodies. Encrypt session files at rest. Clear credential buffers after use.

---

### AUDIT-2026-007 — No crawl rate limiting enables target site DoS

- **Severity:** `HIGH`
- **Location:** `src/cli/commands/audit-only.ts:300`
- **Description:** BFS crawler makes no delay between page requests. Rapid-fire HTTP requests can cause resource exhaustion on target sites.
- **Suggestion:** Add configurable delay between requests (default 100-200ms). Respect robots.txt crawl-delay directive.

---

### AUDIT-2026-008 — API key passthrough enables billing abuse

- **Severity:** `HIGH`
- **Location:** `src/cli/commands/run.ts:51`
- **Description:** User-supplied anthropicApiKey falls back to server-side env var. Any authenticated user consumes server quota.
- **Suggestion:** Never accept API keys via HTTP. Use only server-side env var.

---

### AUDIT-2026-009 — CLI --password flag exposes credentials in shell history

- **Severity:** `HIGH`
- **Location:** `src/cli/index.ts:43`
- **Description:** Password accepted directly from command-line arguments. Stored in shell history, visible in ps aux, and logged by audit tools.
- **Suggestion:** Deprecate --password in favor of --password-env only. Add a warning if --password is used.

---

### AUDIT-2026-010 — Config injection via API — arbitrary key override

- **Severity:** `HIGH`
- **Location:** `src/core/browser.ts:54`
- **Description:** Request body config spread directly into TesterConfig without validation. Attacker can inject anthropicApiKey, videoDir, outputDir, sessionPath.
- **Suggestion:** Whitelist allowed keys. Validate types/ranges. Block sensitive fields.

---

### AUDIT-2026-011 — No rate limiting on login endpoint

- **Severity:** `HIGH`
- **Location:** `src/server/index.ts:238`
- **Description:** Spawns headless browser per request with no rate limiting. Enables DoS via flooding, credential brute-force, anonymous login proxy.
- **Suggestion:** Add per-IP rate limiting (5 req/min), queue login requests, add proof-of-work.

---

### AUDIT-2026-012 — IDOR in job access — no ownership check

- **Severity:** `HIGH`
- **Location:** `src/server/index.ts:143`
- **Description:** Any authenticated user can access any job ID. Endpoints return data for any valid job ID without authorization check.
- **Suggestion:** Store user_id per job. Verify ownership before returning data.

---

### AUDIT-2026-013 — Race condition in activeJobId — concurrent job starts

- **Severity:** `HIGH`
- **Location:** `src/server/index.ts:37`
- **Description:** Module-level mutable variable accessed across async request handlers without synchronization. Concurrent requests create orphaned Chromium processes.
- **Suggestion:** Use an async mutex or atomic compare-and-set. Consider a proper job queue.

---

### AUDIT-2026-014 — Server API has zero test coverage

- **Severity:** `HIGH`
- **Location:** `src/server/index.ts:71`
- **Description:** Entire HTTP API surface untested. No tests for auth middleware, SSRF validation, config sanitization, storage operations.
- **Suggestion:** Create tests/server/ suite: auth middleware, input validation, SSRF callback rejection, storage ops.

---

### AUDIT-2026-015 — Timing attack on Bearer token comparison

- **Severity:** `HIGH`
- **Location:** `src/server/middleware.ts:33`
- **Description:** Bearer token authentication uses !== for string comparison, which is not constant-time. Byte-by-byte deduction is feasible against low-latency deployments.
- **Suggestion:** Use crypto.timingSafeEqual(Buffer.from(token), Buffer.from(API_SECRET)).

---

### AUDIT-2026-016 — Session token not cryptographically secure

- **Severity:** `HIGH`
- **Location:** `src/server/middleware.ts:60`
- **Description:** Tokens use Date.now() + Math.random() — both predictable. Session data parameter is accepted but completely ignored.
- **Suggestion:** Use crypto.randomUUID() or crypto.randomBytes(32).toString("hex"). Implement session storage with expiration.

---

### AUDIT-2026-017 — CSS selector injection in analyzer

- **Severity:** `MEDIUM`
- **Location:** `src/assertions/dom.ts:107`
- **Description:** Element IDs/names interpolated into CSS selectors without escaping.
- **Suggestion:** Use CSS.escape() for IDs/names in selectors.

---

### AUDIT-2026-018 — Assertion result values not truncated

- **Severity:** `MEDIUM`
- **Location:** `src/assertions/dom.ts:44`
- **Description:** DOM assertion actual values captured in full. Elements with 100KB+ text produce oversized results.
- **Suggestion:** Truncate actual values: actual: text.slice(0, 1000).

---

### AUDIT-2026-019 — Cookie injection via unvalidated loadCookies input

- **Severity:** `MEDIUM`
- **Location:** `src/auth/session.ts:25`
- **Description:** JSON.parse() result passed directly to page.setCookie() without schema validation. Malicious cookie data can be injected.
- **Suggestion:** Validate parsed cookies against expected schema. Restrict cookie domains to target URL domain.

---

### AUDIT-2026-020 — Missing Content-Security-Policy on HTML reports

- **Severity:** `MEDIUM`
- **Location:** `src/cli/commands/audit-only.ts:364`
- **Description:** HTML reports have no CSP headers. Content is HTML-escaped but CSP provides defense-in-depth.
- **Suggestion:** Add Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:.

---

### AUDIT-2026-021 — Puppeteer launched with --no-sandbox

- **Severity:** `MEDIUM`
- **Location:** `src/cli/commands/audit-only.ts:371`
- **Description:** Chrome launched without sandbox. Combined with evaluate vulnerability, malicious JS has system-level access.
- **Suggestion:** Remove --no-sandbox in production. Document security implications.

---

### AUDIT-2026-022 — No request body size limit on Express

- **Severity:** `MEDIUM`
- **Location:** `src/cli/commands/audit-only.ts:397`
- **Description:** express.json() without explicit limit. Large payloads consume memory.
- **Suggestion:** Set express.json({ limit: "512kb" }).

---

### AUDIT-2026-023 — Generator output has no runtime type validation

- **Severity:** `MEDIUM`
- **Location:** `src/cli/commands/audit-only.ts:421`
- **Description:** JSON.parse(...) as TestScenario[] is unchecked cast. AI-generated JSON could contain invalid data.
- **Suggestion:** Use runtime validation (zod schema) matching TestScenario[] type.

---

### AUDIT-2026-024 — CORS credentials: true enables cross-origin session theft

- **Severity:** `MEDIUM`
- **Location:** `src/cli/commands/audit-only.ts:443`
- **Description:** credentials: true in CORS config allows cookies and auth headers to be sent cross-origin.
- **Suggestion:** Only enable credentials: true for origins you fully control. Add CSRF token validation.

---

### AUDIT-2026-025 — JSON.parse of stored job results without schema validation

- **Severity:** `MEDIUM`
- **Location:** `src/cli/commands/audit-only.ts:453`
- **Description:** JSON.parse(storedJob.result!) assumes stored JSON matches TestRun schema. Corrupted DB row causes unhandled TypeError.
- **Suggestion:** Wrap in try-catch with meaningful error. Validate critical fields.

---

### AUDIT-2026-026 — Scenario IDs from AI response not validated

- **Severity:** `MEDIUM`
- **Location:** `src/cli/commands/audit-only.ts:682`
- **Description:** AI-generated scenario IDs accepted without format validation. Malicious IDs could contain path traversal.
- **Suggestion:** Validate scenario IDs with /^[A-Za-z0-9_-]{1,50}$/.

---

### AUDIT-2026-027 — Path traversal via videoDir and outputDir

- **Severity:** `MEDIUM`
- **Location:** `src/cli/commands/audit.ts:178`
- **Description:** User-controlled paths used with mkdirSync({ recursive: true }) and file writes without sanitization.
- **Suggestion:** Resolve paths and verify within project root. Reject absolute paths from user input.

---

### AUDIT-2026-028 — Missing URL protocol validation

- **Severity:** `MEDIUM`
- **Location:** `src/cli/commands/audit.ts:224`
- **Description:** URL validation only checks new URL() parsing. Does not reject file://, private IPs, or non-HTTP protocols.
- **Suggestion:** Whitelist http:// and https:// only. Reject private IP ranges.

---

### AUDIT-2026-029 — Cleanup timer prevents graceful shutdown

- **Severity:** `MEDIUM`
- **Location:** `src/cli/utils.ts:12`
- **Description:** setInterval without unref() keeps process alive after server.close(). Causes hanging processes in containers.
- **Suggestion:** Store interval ref, clear in close(). Call .unref().

---

### AUDIT-2026-030 — Upload action exposes arbitrary local files

- **Severity:** `MEDIUM`
- **Location:** `src/core/browser.ts:371`
- **Description:** uploadFile() takes unchecked local file path. AI-generated scenarios could upload sensitive files to target websites.
- **Suggestion:** Restrict to specific uploads directory. Block absolute paths and ../.

---

### AUDIT-2026-031 — Screenshot base64 buffers have no size limit

- **Severity:** `MEDIUM`
- **Location:** `src/core/browser.ts:134`
- **Description:** Screenshot data stored as base64 without size validation. Full-page screenshots can produce 10MB+ strings.
- **Suggestion:** Limit screenshot dimensions. Limit base64 string length.

---

### AUDIT-2026-032 — Test run ID is predictable

- **Severity:** `MEDIUM`
- **Location:** `src/executor.ts:86`
- **Description:** run-${Date.now()} is sequential and predictable, enabling enumeration.
- **Suggestion:** Use UUIDv4 for test run IDs.

---

### AUDIT-2026-033 — Singleton Anthropic client ignores key changes

- **Severity:** `MEDIUM`
- **Location:** `src/scenarios/generator.ts:11`
- **Description:** Module-level singleton client. Once initialized with one API key, subsequent calls with different keys silently use the original.
- **Suggestion:** Create client per request, or key cache by API key value.

---

### AUDIT-2026-034 — CORS allows localhost origins in production

- **Severity:** `MEDIUM`
- **Location:** `src/server/index.ts:57`
- **Description:** Default CORS allows localhost origins. ALLOWED_ORIGINS split by comma without trimming.
- **Suggestion:** Require ALLOWED_ORIGINS in production. Trim after split.

---

### AUDIT-2026-035 — No rate limiting on GET resource endpoints

- **Severity:** `MEDIUM`
- **Location:** `src/server/index.ts:142`
- **Description:** No rate limiting on resource endpoints. Combined with IDOR, enables enumeration and server exhaustion.
- **Suggestion:** Add per-IP rate limiting middleware. Cache report responses.

---

### AUDIT-2026-036 — Error messages leak internal paths

- **Severity:** `LOW`
- **Location:** `src/assertions/a11y.ts:56`
- **Description:** Error responses include err.message with stack traces, file paths, and internal details.
- **Suggestion:** Return generic errors to clients. Log details server-side only.

---

### AUDIT-2026-037 — MFA handler echoes code to terminal in plaintext

- **Severity:** `LOW`
- **Location:** `src/auth/mfa.ts:186`
- **Description:** CLI MFA handler uses readline.question() which echoes typed characters to stdout. MFA codes visible to shoulder-surfers.
- **Suggestion:** Use a library that masks input or suppress echo during code entry.

---

### AUDIT-2026-038 — @types/better-sqlite3 in production dependencies

- **Severity:** `LOW`
- **Location:** `src/cli/commands/audit-only.ts:523`
- **Description:** Type-only package in dependencies instead of devDependencies.
- **Suggestion:** Move to devDependencies.

---

### AUDIT-2026-039 — No graceful browser cleanup on process crash

- **Severity:** `LOW`
- **Location:** `src/cli/commands/audit-only.ts:532`
- **Description:** Shutdown handlers close SQLite but not active browser instances. Chromium processes orphaned on restart.
- **Suggestion:** Track and close active AITester instances in shutdown handlers.

---

### AUDIT-2026-040 — Audit command executes unsandboxed dynamic imports from Master project

- **Severity:** `LOW`
- **Location:** `src/cli/commands/audit.ts:79`
- **Description:** Dynamic import of registry.js and credential-loader.js from Master project. If an attacker controls the Master directory, arbitrary code execution occurs.
- **Suggestion:** Verify Master path integrity. Warn if MASTER_ROOT is overridden.

---

### AUDIT-2026-041 — No audit/telemetry logging for forensics

- **Severity:** `LOW`
- **Location:** `src/cli/utils.ts:34`
- **Description:** No structured audit logging for security-relevant events. Makes compliance auditing and incident forensics impossible.
- **Suggestion:** Add optional structured audit log with event, URL, timestamp, userId.

---

### AUDIT-2026-042 — No timeout on AI API calls

- **Severity:** `LOW`
- **Location:** `src/core/element-finder.ts:31`
- **Description:** Anthropic API calls have no explicit timeout. API hang blocks indefinitely.
- **Suggestion:** Add AbortSignal.timeout() to API calls.

---

### AUDIT-2026-043 — Missing security headers

- **Severity:** `LOW`
- **Location:** `src/server/index.ts:52`
- **Description:** No X-Frame-Options, X-Content-Type-Options, or Strict-Transport-Security headers.
- **Suggestion:** Add helmet middleware or set headers manually.

---

### AUDIT-2026-044 — Bearer token accepts empty string

- **Severity:** `LOW`
- **Location:** `src/server/middleware.ts:32`
- **Description:** Authorization: Bearer with empty token can produce edge cases with empty/whitespace API_SECRET values.
- **Suggestion:** Add explicit check: if (!token || token.length < 8) return 401.

---

## 2026-04-22 — Supplemental findings (E2E audit verification)

**Audit Mode:** AUDIT-ONLY (NO-TOUCH CRITIC respected — zero file modifications to Tester source)
**Method:** CODE audit (e2e-audit-runner + AIRouter) + Vitest 85/85 + Playwright self-audit 42/43 + Playwright E2E 120/151
**Generated by:** Master E2E Audit System, 2026-04-22

### ![HIGH] AUDIT-2026-045 — TypeScript compilation errors (4 confirmed by E2E tests)

- **Severity:** `HIGH`
- **Location:** `e2e-tests/integration/typescript-build.spec.ts`
- **Description:** E2E test suite confirmă 4 bug-uri active de tipare/compile:
  - TypeScript compilation has errors (`tsc --noEmit` fails)
  - `createSession` import does not exist in middleware
  - `writeLine` not exported from CLI utils
  - `LoginResult` type missing `redirectUrl` property
- **Suggestion:** Fix compilation errors; update exports; align types cu implementation.
- **Evidence:** `e2e-report/results.json` — 4 failures marcate `[BUG]`.

---

### ![MEDIUM] AUDIT-2026-046 — Journey audit feature declared but incomplete

- **Severity:** `MEDIUM`
- **Location:** `src/cli/commands/journey-audit.ts`, `CLAUDE.md`, `README.md`
- **Description:** README + CLAUDE.md declară "Journey Audit" ca feature disponibilă. AI code review (Cerebras, 2026-04-22) raportează: "nu este implementată în mod complet". `dist/cli/` conține doar `index.js`, nu subfolder `commands/`.
- **Suggestion:** Fie completează implementarea, fie marchează ca WIP în documentație.

---

### ![MEDIUM] AUDIT-2026-047 — Input validation edge cases (5 E2E failures)

- **Severity:** `MEDIUM`
- **Location:** `e2e-tests/safety/input-validation.spec.ts`
- **Description:** 5 teste eșuează pe scenarii: missing `Content-Type`, very large request body, null values în config, negative values, zero values. API nu respinge/normalizează corect aceste input-uri.
- **Suggestion:** Adaugă validare pe `POST /api/test/start` — respinge Content-Type lipsă, validează config numeric ranges (>=0, valori finite).

---

### ![LOW] AUDIT-2026-048 — Rate limiting returns 429 under concurrent legitimate load

- **Severity:** `LOW`
- **Location:** `e2e-tests/api/test-start.spec.ts`, `e2e-tests/api/test-status.spec.ts`, `e2e-tests/integration/server-lifecycle.spec.ts`
- **Description:** 7 teste eșuează pe sequential API calls — server returnează 429 în loc de 202. Rate limiter pare prea strict pentru scenarii legitime de chain-uri de teste.
- **Suggestion:** Tuning rate limit (mărește burst capacity) SAU ajustează E2E tests să respecte rate window.

---

### ![HIGH] AUDIT-2026-049 — security-scanner plugin regression

- **Severity:** `HIGH`
- **Location:** Master `mesh/qa/plugins/security-scanner` running pe Tester
- **Description:** CODE audit 2026-04-22 raportează: security-scanner score **45/100 (FAILED)**, 9 issues. Benchmark: celelalte 8 plugins au scor 75-100 (infra-checker, cli-tester, load-tester, cross-suggester = 100). Content exact al celor 9 issues nu e expus în log-ul agregat — necesită re-rulat pluginul standalone pentru detalii.
- **Suggestion:** Rulează `security-scanner` standalone pe Tester; cross-check cu CRITICAL findings existente (AUDIT-2026-001/002/003/004).

---

## Metadata

| Field | Value |
|-------|-------|
| **Audit Date** | 2026-04-16 (initial), 2026-04-22 (supplemental +5 findings) |
| **Tester Version** | 0.1.0 |
| **Commit Hash** | `63c7b130aa41626fa7ee0eeab1e28c36d3be6fd7` |
| **Branch** | `master` |
| **Stack** | Node.js, TypeScript, Express 5, Puppeteer, better-sqlite3 |
| **Audit Mode** | AUDIT-ONLY (NO-TOUCH CRITIC) — no files modified, no DB writes, no API calls |
| **Total Files Reviewed** | 45 |
| **Categories Covered** | SSRF, RCE, Auth Bypass, Input Validation, Data Exposure, Path Traversal, DoS, Session Management, Test Coverage, Code Quality, Injection, Cookie Security, Race Conditions, Timing Attacks, Prompt Injection, Rate Limiting |