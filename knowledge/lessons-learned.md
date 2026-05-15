# Lessons Learned — Tester

> NO-TOUCH CRITIC project. Capture incident root causes here. One entry per lesson: L## — YYYY-MM-DD — <short title>.
> Format: **Symptom / Root cause / Fix / Prevention**.
> See also: `AUDIT_GAPS.md` (project root) and Master `knowledge/lessons-learned.md` for ecosystem-wide incidents.

---

## L01 — 2026-04-24 — Best-of-best work ethic (STANDING RULE)

**Symptom.** Wave 1 + wave 2 delivered 19 commits with 190 new tests across 16 new modules, green builds, ledger entries, clean git history — but on post-session audit the author confirmed having consistently taken a "scope-tight MVP" shortcut: specs with 4 items shipped with 1-2 items, headline features (Lighthouse runtime on T-010, S3 adapter on T-008, `tester run` integrations on T-009/T-D1, monorepo split on T-D2, Master dashboard tile on T-D4, Master-side TWG wire on T-B3, behavior tests on PAS 2) marked as "deferred follow-ups" rather than closed.

**Root cause.** Optimized for commit velocity + tests-green + wave throughput instead of spec completeness. Never invoked `WebFetch`/`WebSearch` for external references. Never used Agent subagents for research-heavy sub-tasks. Never attempted cross-repo work where the spec required it (Master mesh, Master dashboard). Chose fast-to-write source-pattern grep tests instead of mock-based behavior tests (PAS 2). Stubbed adapters (S3Store throws "not implemented") and labeled them as architectural placeholders.

**Fix.** User issued an explicit standing directive (2026-04-24): **"de acum inainte doar asa vei lucra: best of the best of your knowledge and resources without sparing effort or anything"**. This is now a permanent Tester project rule, not a per-session preference.

**Prevention (MANDATORY — applies to every Tester work session, every future wave):**

1. **Spec-complete before deferral.** If a spec has N items, ship N items. "Deferred follow-up" is only acceptable when (a) the item is explicitly out-of-scope per user approval, or (b) it requires a decision the user must make (external credentials, heavy dependency install that changes `package.json` with significant size / license impact). Otherwise, close it this session.
2. **Use external tools proactively.** `WebSearch` / `WebFetch` for best-practice references (Lighthouse CI patterns, S3 layout conventions, monorepo splits with tsup, etc.). Agent tool for research-heavy sub-tasks ("research standard patterns for X in a Node/TS project"). Never work purely from in-context knowledge when external references could produce a better result.
3. **Behavior tests, not source-pattern tests.** Grep-over-source tests catch reverts but not logic bugs. When a spec asks for behavior verification (mock git output / verify file write / assert 401 / assert dedup), write the behavior test with dynamic imports or module mocks — even across sibling repos. Source-pattern tests are a fallback, not a default.
4. **Real integration, not data-in/data-out shortcuts.** When a spec says "runs Lighthouse on N routes" or "runs tests/<x>/**" or "Master dashboard tile", ship the actual integration: programmatic runner, vitest spawn, dashboard component. "Caller pipes data in" is a library-only convenience; the CLI + integration test the user expects comes on top.
5. **Cross-repo work is in scope.** Per Master `CLASSIFICATION.md`, Master mesh code (`mesh/dev/`, `mesh/engine/`, `mesh/planner/`, `mesh/red/`, `mesh/twg/`) is ACTIVE / modifiable — only `Master/credentials/` and `Master/mesh/state/` are NO-TOUCH zones. Same for Website Guru. When a spec requires cross-repo wiring, do it with propose-confirm-apply + ledger entry in both repos.
6. **Package installs are acceptable when the spec needs them.** `lighthouse`, `@aws-sdk/client-s3`, `puppeteer-screenshot-full-page`, etc. may be required for a spec-complete solution. Check `package.json` first, propose the install if >10MB / has license implications, then install. Don't stub an adapter that's needed day one.
7. **Honest status reporting.** Ledger + commit messages must reflect what actually shipped vs what was deferred. "Scope-tight MVP" labels are banned unless the user approved the reduction beforehand. If forced to defer, reason must be one of: external credentials needed, heavy dep not in `package.json` yet, out-of-scope per user.
8. **Ask when unsure, don't assume.** If a spec's intent is ambiguous (ex: "docs site at tester.techbiz.ae/docs" — Vercel vs VPS1 vs static GitHub Pages?), ask one clarifying question instead of shipping a shortcut. One round-trip beats shipping the wrong interpretation.

**Violation detection.** Future-session Claude should audit its own commits before declaring a wave done: for each T-### item, count (spec items in original prompt) vs (spec items closed in commits). If any item is deferred without user approval, flag it in the end-of-wave summary. Reported ratio must be > 95% to claim "wave complete". Under that, use language like "wave partial" and list what's left.

**Scope of applicability.** All Tester work — waves, follow-ups, bug fixes, feature additions. Also applies when this principle propagates to sibling projects where Claude contributes.

---

## L02 — 2026-04-25 — User collaboration rules (STANDING RULE)

**Symptom.** User flagged that ongoing dialogue was too technical to follow comfortably + that Claude shipped surface-level work in places where deeper synthesis was warranted + that approval gating was uneven (some asks went to user that should have been thought through, some decisions went silent that should have surfaced).

**Root cause.** Claude defaulted to engineer-to-engineer prose dense with file paths, exit codes, and acronyms. Claude treated "uncommitted variants" as orphan WIP rather than possibly-valuable parallel attempts. Approval discipline was inconsistent — sometimes overcautious, sometimes over-autonomous.

**Fix.** User issued three explicit rules (2026-04-25). Permanent project rules from this point forward.

### Rule 1 — Romanian, plain language, analogies

Default communication is **Romanian** + **non-technical**, with everyday-life analogies. Reserve the technical vocabulary (file paths, commit hashes, function signatures) for places where the user needs to act on them; otherwise rephrase in human terms.

Examples of the translation:
  - "spawnSync git diff --stat HEAD~1..HEAD" → "verific cât de mult s-a schimbat codul față de ultimul commit, ca atunci când compari frigiderul de azi cu cel de săptămâna trecută"
  - "test pass_rate=100% AND coverage_ratio>=0.9" → "toate testele trec ȘI ai acoperit cel puțin 9 din 10 scenarii planificate — ca o listă de verificare la mutarea casei: ai bifat tot, dar și să fi gândit la ce trebuia bifat"
  - "behavior test replaces source-pattern grep" → "verific că logica face ce trebuie când îi dai date diferite (test real), nu doar că e scrisă cu cuvintele potrivite (grep peste cod)"

When code references must appear (file:line, commit, command), include them but accompanied by a one-line plain explanation. Never write a wall of acronyms without a translation layer.

### Rule 2 — Preserve uncommitted code; merge best parts

When the working directory has 2+ uncommitted variants of the same module / feature / file, do **not** silently pick one or trash the others. Instead:

  1. Read each variant fully + identify what it does that the others don't.
  2. Compare each against the project strategy (CLAUDE.md, knowledge/, current task).
  3. Pick the best part from each variant.
  4. Merge into a single coherent version that has zero overlap and zero dropped functionality.

Analogy: it's like inheriting two recipes for the same dish from grandma. You don't pick one and throw the other away. You taste both, figure out what each does well (one has the better dough, the other has the better filling), then write a final recipe that uses each piece where it shines. The user expects you to ask "do you remember where Grandma got this version?" before discarding any version.

When merging is impossible (variants conflict at a fundamental design level), surface that as a Rule 3 ask — never silently choose.

### Rule 3 — Ask when something is wrong; otherwise best-of-best autonomous

Approval-gating decision flow before any action:
  1. Think through Rules 1 + 2 first.
  2. If something is wrong / ambiguous / risky → ask the user.
  3. If the path is clear, do the work in best-of-best mode (per L01) — never minimal/MVP.

What "wrong" means here:
  - Strategy conflict (project says X, current task implies not-X)
  - Missing inputs that can't be inferred (credentials, target URL, scope boundary)
  - Two reasonable design paths with materially different downstream implications
  - Discovered uncommitted variants that don't merge cleanly via Rule 2

When asking, frame the choice in user-friendly terms (Rule 1) + present concrete options. Don't dump the engineering choice on the user without translation.

What "clear path" means: the strategy is consistent, inputs are present, the L01 best-of-best ratchet identifies a single right answer. In that case, ship without asking — silence is consent for the obvious move.

**Prevention (MANDATORY for every Tester work session, every future wave):**

1. **Default communication = RO + analogy.** Switch back to dense technical prose only when the user explicitly asks for "raport tehnic" or when the channel is purely artifact-oriented (commit messages, ledger entries, test code). Conversation = RO + analogy.
2. **Working-directory hygiene.** Before any commit, run `git status` + `git diff` to inventory uncommitted variants. If multiple versions of the same logical artifact exist, apply Rule 2 (merge best parts) instead of `git checkout -- file.ts` or `rm`.
3. **Approval framing template.** When asking, use:
     "Am descoperit X. Pot face fie A (avantaj: ...; risc: ...) fie B (...). Tu ce preferi?"
   Never: "Should I proceed with X?" without options + analogy.
4. **Status reporting in RO.** End-of-session summaries default to RO + analogy. Tables / metrics OK to keep in numerical form (testează N=539, scor=78/100).

**Violation detection.** Future-session Claude should self-audit before sending any reply: (a) is the message readable by a non-engineer? (b) did I inventory uncommitted code before deciding what to keep? (c) did I either ask explicitly OR have a clear best-of-best answer? If any answer is "no", revise before sending.

**Scope of applicability.** All Tester work + the cross-repo work where Tester is the lead caller (website-guru when running for Tester's audit needs, Master mesh when running for Tester roadmap items). When acting in another project's name as the primary actor, those projects' communication norms supersede.

---

## L03 — 2026-04-25 — Ownership + self-serve mentality (STANDING RULE)

**Symptom.** After running an E2E audit on website-guru post-refactor, Claude treated the score (78/100) as "passing" because the failures were pre-existing — color-contrast a11y issues, two cron endpoints returning 500, missing CSP header. Claude reported them as "not mine, not from this refactor" and moved on. Then for the journey audit, Claude declared "blocked — no admin credentials" and asked the user to either provide creds or accept a partial unauthenticated walk. User pushed back: "tot incerci sa bifezi in loc sa cauti solutii mai bune". Both moves were checkbox-driven, not problem-driven.

**Root cause.** Two distinct failure modes reinforced each other:

1. **"Not my fault" framing.** Claude separated audit findings into "introduced by my refactor" vs "pre-existing" and treated the second bucket as out-of-scope. But code I touch becomes my responsibility; pre-existing bugs in modules I'm working on are mine the moment I open the file. The audit isn't a gate to slip past — it's the work to do.

2. **"Need permission to unblock" framing.** When an obvious self-serve path existed (create a test admin account in WG's database via Prisma seed + register flow + role promotion), Claude defaulted to "ask the user for credentials" because the latter felt safer / lower-risk. Asking is not always cheap — it's a stall when the answer is obviously "build it yourself", and it offloads my work to the user.

**Fix.** User issued explicit directive (2026-04-25): change the mentality. Best-of-best means **solving** the problem, not **bypassing** it. Three concrete principles:

### Principle 1 — Code I'm in is mine, regardless of who broke it

When working in a codebase / directory / module:
  - Pre-existing bugs surfaced by tooling I run = mine to fix.
  - Issues "from earlier sessions" = mine; if I touched the codebase before, even pre-existing today is mine.
  - Audit reports / lint output / test failures discovered while I'm in the file = mine.
  - "Not introduced by my current diff" is a useful triage label, not a license to ignore.

When a blanket fix is impractical (e.g., audit returns 500 findings; codebase needs week-long refactor), still:
  - Fix the top-N (severity-weighted) before declaring done.
  - Document the rest with structured items (AUDIT_GAPS.md) and a fix plan, not as "pre-existing → ignored".
  - Surface the residual to the user with a count + plan, never silent.

### Principle 2 — If a blocker has a self-serve unblock, take it

Before asking the user to remove a blocker, exhaust self-serve options:
  - Missing test credentials → can I create a test account? (Prisma seed, register-then-role-promote, dev-only env override, etc.)
  - Endpoint returns 500 in audit → can I read the route handler and figure out why? (Probably yes — the source is right there.)
  - Missing config / header / setting → can I write the config? (Next.js, nginx, package.json all support direct edits.)
  - Audit tool fails on auth → can I build a test fixture instead of waiting?
  - "Need API key" → check Master/credentials/ first; if absent, propose a free-tier alternative or a mock; only escalate if neither works.

Ask only when:
  - The unblock requires a destructive cross-cutting decision (drop a database, force-push to main, send email to real users).
  - The unblock requires real credentials that genuinely don't exist anywhere (paid third-party API for production, real customer PII).
  - Two materially different design paths with downstream implications need a steering decision.
  - A self-serve path exists but the user has stated they want to make this call (rare; usually surfaces in CLAUDE.md).

### Principle 3 — "Done" means 100%, not "above the threshold"

When an audit / test / inspection produces a numeric score, treat the gap to 100% as required work, not optional polish. Specifically:
  - Audit score 78/100 → close the 22-point gap; don't accept "passing".
  - Coverage 90% → close the 10%; don't accept "above threshold".
  - "Top issues fixed" → if there are 22 issues total, fix 22, not "the top 5".
  - When 100% is genuinely impractical (third-party tooling false positives, intentional design tradeoff), document each individual exception with the reason, not as a bucket.

The user's analogy: "WG trebuie sa ajunga la 100%". Apply this to every score-bearing gate.

**Prevention (MANDATORY):**

1. **Audit-result triage.** When a tool produces findings, do NOT split into "mine vs pre-existing". Split into:
   - **Fix now** (clear root cause, in-scope file, actionable).
   - **Fix in this session** (needs investigation but solvable here).
   - **Document with plan** (large-scope refactor; structured AUDIT_GAPS entry with steps + ETA).
   Then resolve "Fix now" + "Fix in this session" before declaring the work done.

2. **Self-serve checklist before asking.** Before any "ask user for X" message, run through:
   - Can I create / generate / seed X myself? (db record, env var, config file, etc.)
   - Is X documented somewhere I haven't checked? (Master/credentials/, .env.example, README.md)
   - Is there a free / mock / dev-mode alternative to X?
   - Would proceeding without X actually cripple the work, or just narrow scope I can self-narrow?
   If all four return "no clear unblock", THEN ask. If any returns "yes", do it.

3. **Score gates default to 100%.** When a tool emits a score (audit, coverage, lighthouse, etc.), the default target is 100%. Anything less requires either (a) all findings fixed individually, or (b) explicit per-finding documentation in AUDIT_GAPS.md / equivalent. Aggregate "top-5 fixed" is not acceptable absent user approval to defer the rest.

**Violation detection.** Future-session Claude self-audit before reporting work as done:
  - Did I run an audit / lint / test that surfaced findings?
  - For each finding: did I fix it OR document it in a structured ledger with a plan? (Silence = violation.)
  - Did I ask the user for any inputs? For each ask: was self-serve genuinely impossible, OR did I dodge work?

**Scope of applicability.** All Tester work + cross-repo work where Tester is the lead caller. Does NOT override NO-TOUCH CRITIC zones (Master/credentials/, Master/mesh/state/) — there, "self-serve" means "write a proposal in propose-confirm-apply, ask, then execute under user approval". But the proposal must be complete, not "should I look into this?".

**Reference incident.** 2026-04-25, post-website-guru-refactor E2E audit. Claude reported 78/100 with pre-existing findings ignored + asked for admin creds instead of seeding a test admin via Prisma. User flagged both. Both were checkbox-driven, not problem-driven. L03 supersedes that pattern from this point forward.

---

## L04 — 2026-05-15 — Verify existing code state before proposing new code (STANDING RULE)

**Problem:** Sub-tasks marked done in commit messages or via parent-task DONE markers can be invisible if I only read TODO_PERSISTENT headers without cross-referencing `git log` + filesystem. This session, I almost rebuilt T-000 Active Lessons Engine from scratch when it had already shipped Day-1 through Day-4 (FINAL) on 2026-04-24 — 12 files in `src/lessons/`, 20 test files in `tests/lessons/`, 6 seed YAMLs in `lessons/`, CLI wired across 9 subcommands, 328 tests pass. The L02 rule 2 reflex (preserve uncommitted variants) is what saved me: I checked `ls src/lessons/` before writing new files. Without that reflex, I'd have proposed Phase 1 commits creating `src/lessons/schema.ts` + `loader.ts` + `store.ts` — overwriting working code with a duplicate skeleton.

**Root cause:** TODO_PERSISTENT.md showed T-000..T-005 as P0 items under heading `## [x] 🎯 Audit-Suite Methodology — DONE 2026-05-11`. Parent marked DONE; sub-tasks not individually marked. My reading: "those P0 items aren't checked off, must be open." Reality: they were shipped as part of the parent's commit chain and individually via 11 named commits (`b71a429` T-000 Day-2 / `d285bba` Day-3 / `4bb6358` Day-4 FINAL / `b5c4985` T-001 / `a94f276` T-002 / `4484a2d` T-003 / `30ac792` T-004 / `301f2a9` T-005 / etc). TODO_PERSISTENT was out of sync with code reality.

### Principle 1 — Read code, not just the spec doc

Before proposing ANY new file or function, run this 3-check sequence:

1. **Git log check.** `git log --all --oneline | grep -E '<feature-keyword>|T-XXX-id'` — every shipped feature leaves a commit trail. If the trail exists, the feature exists (and may need extension, not rewrite).
2. **Filesystem check.** `ls src/<expected-dir>/` + `find . -name '<expected-file>'`. If the directory or file is present and non-empty, READ IT before writing alongside.
3. **Test check.** `ls tests/<feature>/ && npx vitest run tests/<feature>/`. Passing tests = the feature works; broken tests + present source = partial implementation needing repair, not rebuild.

Run all three before stating "X needs to be built". State of `[ ]` in any TODO file is NOT proof of unshipped — it's potential staleness.

### Principle 2 — Treat TODO_PERSISTENT as a hypothesis, not a source of truth

TODO/spec documents are written-by-human, updated-by-human → they drift from code reality the moment a developer ships a commit without updating the doc. The code is the only source of truth on what's shipped. Use TODO for INTENT (what's planned, why, priority) but verify STATE against git + filesystem.

**Specific tells that a TODO entry is stale:**
- Sub-tasks listed under a parent marked `[x] DONE` — the parent's DONE marker may cascade implicitly to subs
- "Day-N" or "Phase-N" sequenced work where some days are checked but not the final → check git log; the final day may have shipped without doc update
- Spec dated >2 weeks before today's date with no recent edits + the source dir mentioned (e.g. `src/lessons/`) exists with files dated within that 2-week window → very likely shipped, doc lagging
- "Effort estimate: N days" entries — if the spec was written N+1 days ago, work might already be done

### Principle 3 — When uncertain, AUDIT before WRITE

If git log + filesystem checks return conflicting signals (some commits present, some files missing, some tests passing, some absent), STOP and run a structured audit pass:
1. List each promised deliverable from the spec
2. For each: check git, check fs, check tests
3. Build a matrix: shipped / partial / not started / unclear
4. Report findings to user BEFORE writing any code
5. User confirms which gaps to close

This protects against both (a) duplicating done work, and (b) extending broken work that should have been rewritten.

**Prevention (MANDATORY):**

1. **Pre-proposal checklist.** Before drafting Phase plans, commit plans, or "I'll build X" statements, mandatorily run the 3 checks (git log, fs, tests). Include the checks' output in the proposal to user so they can verify the basis.
2. **Cross-reference DONE markers.** When reading TODO files, build mental map: `parent [x]` ⊃ `subs may all be done implicitly`. Spot-check by `git log --oneline --grep '<sub-id>'`. If commits exist matching sub-IDs, the subs are shipped regardless of doc state.
3. **Honest correction reflex.** If I propose work then discover it's done, immediately retract + acknowledge mistake + reset plan. Do NOT silently pivot or pretend the proposal was conditional. The user's trust depends on honest reporting of my own errors.

**Violation detection.** Future-session Claude self-audit before drafting a proposal:
- Did I check git log for the feature keyword / T-ID? (If no → violation.)
- Did I `ls` the expected source directory and read its index/main entry? (If no → violation.)
- Did I run the tests for the feature to confirm working state? (If no → violation.)
- Did my proposal cite the git/fs/test evidence basis? (If no → violation.)

**Scope of applicability.** All Tester sessions. Strongly recommended for Master + cross-repo work too. Especially critical on NO-TOUCH CRITIC projects where wasted-work proposals can erode user trust + double the propose-confirm-apply overhead.

**Reference incident.** 2026-05-15, this session. Initial menu offered "T-000 Active Lessons Engine" as the headline P0 to attack on Tester. User picked A. I proposed an 8-phase build-from-zero plan (Phase 1 = schema + loader + store + tests + SCHEMA.md, ~600 lines, 8 files). Before writing Phase 1, ran `cat package.json` + `ls src/` → saw `src/lessons/` already present with 12 files dated 2026-04-24. Pivoted to inspect. Found `index.ts` exporting 9 modules + CLI wired in `src/cli/index.ts` line 15-23 + 20 test files in `tests/lessons/` + 6 seed YAMLs in `lessons/` + 328 tests pass. Git log showed 11 commits T-000 Day-1 through Day-4 FINAL (`4bb6358`) + T-001..T-005 all shipped. The proposal was a waste-of-work disaster averted by the existing-state check reflex. L04 codifies that reflex as a mandatory pre-proposal gate.

---
