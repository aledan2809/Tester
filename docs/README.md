# @aledan007/tester — Documentation Index (T-D3)

> Patterns, recipes, and anti-patterns — stop re-inventing in every session.

## Start here

- [**Cookbook**](cookbook.md) — recipe-style snippets for login, CRUD, snapshot, a11y, perf, regression capture.
- [**Anti-patterns**](anti-patterns.md) — the harness bugs that cost us time in 2026-04-22..24 sessions + how to detect them early.
- [**Scenario matrix patterns**](scenarios.md) — how to declare coverage so `tester coverage` + `tester done` + TWG scoring work.
- [**API contract**](API_CONTRACT.md) — stability tiers, semver rules, package-split roadmap.

## Command cheat sheet

| Command | Purpose |
|---------|---------|
| `tester init <feature>` | Scaffold coverage/*.yaml + spec skeleton + README |
| `tester untested --project .` | Rank open work from coverage + AUDIT_GAPS + DEV_STATUS + Reports |
| `tester coverage --feature <yaml>` | Verify feature coverage against --fail-under threshold |
| `tester selfcheck` | Run harness self-test battery before trusting a test run |
| `tester run <url>` | Full autonomous discover + generate + execute + report |
| `tester snapshot --baseline/--compare/--approve/--list` | Visual regression baseline (local FS) |
| `tester a11y --baseline/--check --from <scan.json>` | A11y regression + budget |
| `tester perf --check/--delta` | Lighthouse / CDP metric budget |
| `tester lessons scan <file>` | Detect anti-patterns before commit (T-000 corpus) |
| `tester lessons classify <log>` | Classify failure as PRODUCT/HARNESS/FLAKE/ENV (heuristic or AI) |
| `tester triage <log>` | TWG routing decision: guru / tester-self / flake-retry / env-fix |
| `tester generate --from-prisma <schema> --model X` | Scaffold CRUD tests from Prisma schema |
| `tester regression add --slug <x> --title "<text>"` | Add sticky regression spec |
| `tester score --project . --tests-passing N --tests-total N` | TWG score = pass_rate × coverage_rate |
| `tester affected --tags auth,billing` | Pick test files whose header tags intersect |
| `tester pipeline-stats --master-path ../Master` | Cross-pipeline failure analytics |
| `tester done <feature> --tests-passing N --tests-total N` | Composite gate: coverage + tests + baselines |
| `tester undone <feature>` | Reopen a done feature (regression triggered) |
| `tester status` | Per-feature done/open state |
| `tester session start/log/end/last/list/show` | Structured session log under .tester/sessions/ |
| `tester zombie-scan --master-path <p>` | List Master pipelines at risk of 30min cleanup |
| `tester inventory --project-roots ...` | Cross-project coverage aggregator (T-D4) |

## Version policy

See [API_CONTRACT.md](API_CONTRACT.md). TL;DR:

- **Tier 1** changes (CLI names, exit codes, core exports) → major bump.
- **Tier 2** changes (wave 1+2 helpers imported by consumers) → minor bump + CHANGELOG.
- **Tier 3** changes (`src/server/**`, unexported internals) → no API promise.
