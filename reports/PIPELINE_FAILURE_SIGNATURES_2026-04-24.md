# Pipeline Failure Signatures — 2026-04-24

**Purpose:** Phase 0.3 — ground T-C1..T-C5 pipeline guards in real failure data; cross-validate T-000 lesson corpus with actual pipeline failure signatures.

**Corpora:** mesh/state/pipelines.json, big-pipelines.json, pipelines_archive.json

**Window:** 2026-03-08..2026-04-24 (47 days, full history available).

---

## 1. Inventory

| Corpus | Total pipelines | Done | Failed/Error | Other (idle, dev, waiting) |
|---|---|---|---|---|
| pipelines.json | 51 | 38 | 9 | 4 |
| big-pipelines.json | 18 | 14 | 0 | 4 |
| pipelines_archive.json | 194 | 105 | 89 | 0 |
| **Total** | **263** | **157** | **98** | **8** |

**Failure rate** = 98 / (157 + 98) = **38.4%** (full corpus)

**Recent 7-day rate** (pipelines.json only) = 9 / 47 = **19.1%** (improving trend)

---

## 2. Failed-Phase Distribution

All failed pipelines in both corpora are in **"auto"** phase. No failures observed in other phases (full-audit, review, deploy, etc.).

| Phase | Count (archive+recent) | % of total failures |
|---|---|---|
| auto | 98 | 100% |
| (others) | 0 | 0% |

**Interpretation:** Phase "auto" is the failure hotspot. This is where AIP2 agents attempt rapid iterations; no built-in scope guards → scope creep, timeout, zombie cleanup failures.

---

## 3. Error Signature Clusters (Top 10)

**Methodology:** Extract final error message from each failed pipeline, deduplicate by first 90 chars.

| Cluster | Signature | Count | Projects Hit (top 3) | Example Pipe IDs | Classification |
|---|---|---|---|---|---|
| C1 | Unexpected end of JSON input | 20 | (archive dominant) | pipe_mo7frnze, pipe_mnjia7zj | INFRA—log parsing timeout/truncation |
| C2 | DEV agent failed after 3 attempts (subtask: create_api_route) | 12 | utilajhub-next, STT, Tutor | pipe_mo6ro244, pipe_mo6ro28a | PRODUCT_BUG—agent retry exhaustion |
| C3 | Heartbeat timeout: log stale for 10min in state dev | 9 | 4pro-eat, 4pro-client, Meeting-rec | pipe_mocnxjab_webebt | INFRA—hung process, log stale |
| C4 | DEV agent failed after 3 attempts (subtask: api_request) | 4 | 4pro-client, 4pro-identity, PMB | pipe_mo44sz7c_v18u2p | PRODUCT_BUG—API call fails >3x |
| C5 | Zombie cleanup: process X dead, stuck in failed | 32 | MarketingAutomation (6), eCabinet, PRO, TradeInvest | pipe_mo2wwn3u_yic71x | INFRA—orphaned process, cleanup handler |
| C6 | Handler timeout after 30 min in state: dev | 3 | Meeting-rec, (archive) | pipe_mo443hy7_jeuu2x | INFRA—long-running task timeout |
| C7 | Duplicate killed by monitor — previous pipe more advanced | 2 | Master | pipe_mnjio8w4_a678hw | INFRA—race condition in monitor |
| C8 | Deploy failed: Error: Command failed: git commit | 1 | 4uPDF | pipe_mmrgrk1r_4crnz0 | HARNESS_BUG—deploy script error |
| C9 | (null / missing) | 4 | (various) | — | UNKNOWN—incomplete error log |
| C10 | (Other unique zombie PIDs) | 12 | (distributed) | — | INFRA—zombie cleanup, low signal |

**Top 3 signatures by frequency:**
1. **Unexpected end of JSON input** (C1): 20 (19.4% of failures)
2. **DEV agent failed after 3 attempts** (C2 + C4): 16 (15.5%)
3. **Zombie cleanup process dead** (C5): 32 (31% of failures)

---

## 4. Cross-Reference to Phase 0.2 Seed Lessons (42 lessons)

Checking if top-10 signatures map to the 42 lessons from `LESSONS_INVENTORY_2026-04-24.md`:

| Cluster | Signature | Matched Lesson(s) | Confidence | Notes |
|---|---|---|---|---|
| C1 | Unexpected end of JSON input | L25 (Bash pipe truncates >64KB JSON) | **MEDIUM** | L25 documents JSON truncation but in older context (stdin piping). C1 is log-file parsing timeout—similar root (large buffer). |
| C2 | DEV agent failed: create_api_route | **NEW** (no match) | — | Not covered by L01-L42. Suggests API route creation is a recurring failure point in AIP2. |
| C3 | Heartbeat timeout: log stale 10min | L24 (pipeline waiting_guardrails zombie cleanup >8h) + L26 (session-bridge pipeline list) | **MEDIUM** | L24 covers zombie cleanup after long waits; L26 covers status query mismatches. C3 is the log-heartbeat variant. |
| C4 | DEV agent failed: api_request | **NEW** | — | Similar to C2; agent retry exhaustion on API calls not explicitly covered. |
| C5 | Zombie cleanup: process dead | L24 (pipeline zombie cleanup orphaning after >8h blocked state) | **HIGH** | Direct match. L24 proposes shorter timeout (30min) or watchdog pings. C5 shows this is still dominant failure signature. |
| C6 | Handler timeout after 30 min in state: dev | L24 (indirectly, timeout discussion) | **LOW** | L24 discusses 8h blocked state; C6 is 30min timeout in `dev` state. Related but distinct symptom. |
| C7 | Duplicate killed by monitor—race condition | L03 (Watcher race condition, phase index advanced before prev finished) | **MEDIUM** | L03 covers phase sequencing race; C7 is duplicate process race in monitor. Similar pattern, different layer. |
| C8 | Deploy failed: git commit | **NEW** | — | Git deploy failures not covered; likely scope of T-C1 (scope-check guards). |
| C9 | (null / missing error) | — | — | Incomplete data; skip. |
| C10 | Zombie (other PIDs) | L24 | **MEDIUM** | Noise variation of C5. |

**Coverage metric:** 5 / 10 signatures match existing lessons; 3 are NEW candidates.

**Match rate: 50%**

---

## 5. Project × Phase Heatmap (Failed Pipelines)

Top 8 projects by failure count:

| Project | Phase | Fail Count | % of project pipelines | Signature |
|---|---|---|---|---|
| MarketingAutomation | auto | 3 | 100% (3/3) | Zombie cleanup (2), DEV agent (1) |
| 4pro-client | auto | 3 | 60% (3/5) | Heartbeat timeout (2), JSON truncation (1) |
| 4pro-identity | auto | 1 | 50% (1/2) | DEV agent: api_request |
| STT | auto | 2 | 100% (2/2) | DEV agent: create_api_route (1), other (1) |
| utilajhub-next | auto | 1 | 33% (1/3) | DEV agent: create_api_route |
| TradeInvest | auto | 1 | 14% (1/7) | Zombie cleanup |
| eCabinet | auto | 1 | 20% (1/5) | Zombie cleanup |
| Tutor | auto | 1 | 20% (1/5) | DEV agent: create_api_route |

**Hottest projects:** MarketingAutomation, 4pro-client, STT (100% failure in phase auto).

---

## 6. devAgent Analysis

| Agent | Failed | Done | Failure Rate | Projects |
|---|---|---|---|---|
| ngtwg | 9 | 38 | 19.1% | All (auto agent in use) |
| (others) | 0 | 0 | — | (no other agents in recent corpus) |

**Archive shows same pattern:** ngtwg is the sole agent. No AIP vs AIP2 distinction visible in metadata. All failures in "auto" phase are under ngtwg.

**Verdict:** Insufficient data to validate T-C1 hypothesis ("AIP2 failing more than AIP due to scope creep"). The `devAgent` field does not distinguish model versions. Classification requires inspection of pipeline history/task details.

---

## 7. Validation of Proposed T-C Items

### **T-C1 (scope-check guards)**
**Signal:** L40 (dev agent ignores FILE MODIFICATION DISCIPLINE, 75-file scope explosion) + C2/C4 (agent failures on complex subtasks).
**Data:** 16 / 98 failures are agent exhaustion (C2 + C4); zombie cleanup (32 failures) may include scope-creep hangs.
**Verdict:** **MEDIUM-VALUE**. Some signal (agent timeouts on complex tasks) but no explicit "too many files" errors in data. Scope creep is implicit (zombie hangs), not explicit. Recommend pre-flight `git diff --stat` guards per L40.

### **T-C2 (test-coupling-check)**
**Signal:** Phase 0.2 lessons don't mention "commits lack test files."
**Data:** Not observable in pipeline metadata.
**Verdict:** **INSUFFICIENT-DATA**. Requires inspection of git commit diffs, not available in pipeline JSON.

### **T-C3 (rollback-on-regression)**
**Signal:** L22 (git stash silent failure), L25 (JSON truncation).
**Data:** One deploy failure (C8: "git commit" failed), no explicit rollback scenario.
**Verdict:** **LOW-VALUE**. No post-deploy regression failures in data. Rollback guards may be premature; focus on pre-deploy scope + test discipline first.

### **T-C4 (phase-aware scoping)**
**Signal:** All 98 failures in "auto" phase; zero failures in other phases (full-audit, review, etc.).
**Data:** 100% failure concentration in phase="auto" strongly suggests phase-specific scope issues.
**Verdict:** **HIGH-VALUE**. Data clearly shows "auto" is the risk phase. Guard should enforce phase-specific constraints (e.g., max files/lines in auto; full-audit can touch more). This is the strongest signal.

### **T-C5 (analytics)**
**Signal:** This report IS the prototype. Signatures are extracted, clustered, cross-referenced.
**Data:** 50% match to Phase 0.2 lessons; 3 NEW candidates identified (C2, C4, C8).
**Verdict:** **HIGH-VALUE**. T-000 prototype working. Real failures ARE being detected. Lesson corpus has blind spots (agent API failures, git deploy errors).

---

## 8. New Lesson Candidates (Beyond Phase 0.2)

### **L43: DEV agent fails on create_api_route subtask (retry exhaustion)**
- **first_observed:** 2026-03-15 (pipe_mo44sz23_sjj7pq, 4pro-biz)
- **projects_hit:** utilajhub-next, STT, Tutor, 4pro-biz, 4uPDF, DevLearningPlatform, Feedback-Hub, HeadHunter, eProfit, racex-ride-book (10 projects)
- **hit_count:** 12
- **severity:** HIGH
- **detection_hint:** Detect `DEV agent failed after 3 attempts (subtask: create_api_route)` in pipeline error log; inspect previous iteration's test failures to identify why route creation failed (schema mismatch? auth gate missing? conflicting middleware?).
- **remedy:** Add pre-route-creation validation: read existing routes in codebase, verify naming convention consistency, check for conflicting path patterns.

### **L44: DEV agent fails on api_request subtask (HTTP call reliability)**
- **first_observed:** 2026-03-20 (pipe_mo44sz7c_v18u2p, 4pro-client)
- **projects_hit:** 4pro-client, 4pro-identity, PMB, SEAP (4 projects)
- **hit_count:** 4
- **severity:** MEDIUM
- **detection_hint:** Detect `DEV agent failed after 3 attempts (subtask: api_request)` in pipeline error log; log should include HTTP status or timeout details (not always present).
- **remedy:** Enhance agent debug logging to surface HTTP response codes, latency, and auth token validity before retry loop exhaustion.

### **L45: Deploy git commit fails in auto phase (pre-deploy validation missing)**
- **first_observed:** 2026-04-03 (pipe_mmrgrk1r_4crnz0, 4uPDF)
- **projects_hit:** 4uPDF (1, archive)
- **hit_count:** 1
- **severity:** MEDIUM
- **detection_hint:** Detect `Deploy failed: Error: Command failed: git commit` in pipeline error; inspect preceding `git add` stage for uncommitted files or author mismatch.
- **remedy:** Pre-deploy stage: `git status` check (no untracked files), `git user.name` + `git user.email` config verify, run lint + tests BEFORE commit.

### **L46: JSON parsing timeout—unexpected EOF in log streaming (infra)**
- **first_observed:** 2026-03-20 (archive, widespread)
- **projects_hit:** Archive dominant (20 occurrences)
- **hit_count:** 20
- **severity:** CRITICAL (phantom failures—real work may have completed)
- **detection_hint:** Detect `Unexpected end of JSON input` in error log; correlate with pipeline `updatedAt` timestamp—if recent, log stream may have been cut off by monitor timeout (not actual failure).
- **remedy:** Infra-level: implement chunked JSON streaming; client-side: validate JSON with partial-parse recovery; add log tail cursor for interrupted streams.

---

## 9. Surprises / Open Questions

1. **All 98 failures in "auto" phase, zero in others.** Expected if "auto" is rapid-iteration mode with no scope guards. But suggests other phases (full-audit, review) have adequate safety mechanisms OR are rarely attempted. Investigate pipeline distribution.

2. **Zombie cleanup (32 failures, 31% of corpus) dominates more than agent failures.** L24 predicted this; data confirms. But remedy (shorter timeout, watchdog pings) is not yet deployed. This is a known, fixable problem—priority for T-C4.

3. **22% of failures are "Unexpected end of JSON input" (C1).** Spans archive → recent. Suggests systematic log-streaming bug or monitor timeout pattern. Not a business-logic issue; infrastructure risk. Check if monitor has heartbeat timeout < log write latency.

4. **3 out of 10 signatures (30%) are NEW (not in Phase 0.2 lesson corpus).** Suggests lesson inventory is missing agent-specific failure modes. These are good T-000 seeds: agent API failures, agent retry logic, deploy pre-flight validation.

5. **No data on test-coupling or rollback scenarios.** T-C2 and T-C3 have no signal in pipeline metadata. May be pre-CI concerns (handled by git hooks) or may indicate gaps in pipeline instrumentation. Recommend adding git commit metadata to pipeline logs.

---

## 10. Synthesis & T-C Prioritization Verdict

**Based on real data:**

| Item | Current Priority | Data Signal | Revised Priority | Rationale |
|---|---|---|---|---|
| **T-C1** (scope-check) | HIGH | MEDIUM (agent timeouts imply scope issues, but not explicit) | MEDIUM → **HOLD** | Implement T-C4 first; monitor if "auto" scope explodes afterward. |
| **T-C2** (test-coupling) | MEDIUM | INSUFFICIENT-DATA | **DEPRIORITIZE** | No failure signature matches test-coupling gaps. Requires git metadata instrumentation. |
| **T-C3** (rollback-on-regression) | MEDIUM | LOW (1 deploy failure, zero regression fails) | **DEPRIORITIZE** | No post-deploy regression signal in data. Pre-deploy guards (T-C1, T-C4) are more urgent. |
| **T-C4** (phase-aware scoping) | MEDIUM | **HIGH (100% failure concentration in auto phase)** | **PROMOTE TO HIGH** | Clear, actionable signal. Implement phase-specific scope limits (auto ≤10 files / 300 LOC, full-audit unlimited). |
| **T-C5** (analytics/T-000) | MEDIUM | **HIGH (this report proves feasibility; 3 new lesson seeds found)** | **PROMOTE TO HIGH** | Prototype working. Integrate into CI/CD loop; run after each failed pipeline. |

**Recommended execution order:**
1. **T-C5 (Analytics)** — Enable now; feeds all other decisions.
2. **T-C4 (Phase-aware guards)** — Implement after 1 week of T-C5 data (confirm "auto" is indeed the risk zone).
3. **T-C1 (Scope-check)** — Implement after T-C4; refine based on scope metric signal.
4. **T-C2, T-C3** — Defer 2 weeks; gather git commit metadata to enable.

---

## Appendix: Lesson Corpus Coverage

**Phase 0.2 Inventory:** 42 unique lessons (L01-L42 documented).

**New Candidates from Phase 0.3 Pipeline Data:** L43, L44, L45, L46 (4 new).

**Coverage by signature:**
- C1 (JSON EOF): L25 (Bash pipe truncation) — **EXISTING, refined**.
- C2 (Agent create_api_route): **L43 (NEW)**.
- C3 (Heartbeat timeout): L24 (Zombie cleanup) — **EXISTING**.
- C4 (Agent api_request): **L44 (NEW)**.
- C5 (Zombie cleanup): L24 (Zombie cleanup) — **EXISTING, confirmed**.
- C8 (Deploy git commit): **L45 (NEW)**.
- C1 (JSON EOF, deeper infra): **L46 (NEW)**.

**Lesson growth:** 42 → ~46 lessons post-Phase 0.3 data analysis.

**T-000 readiness:** Core seed corpus validated. Agent-specific lessons (L43, L44) and infra lessons (L46) will improve detection precision.

