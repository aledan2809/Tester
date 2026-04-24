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
