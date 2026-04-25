# Audit Gaps — Tester

**Project safety**: NO-TOUCH CRITIC (per `Master/CLASSIFICATION.md` §2.2 — consumed by other projects via HTTP API at `tester.techbiz.ae`)
**Last updated**: 2026-04-24
**Maintainer**: Master orchestration (auto-surface at session start)

---

## Permanent instruction — Claude session start

At the start of every session opened on this project:
1. Read this file in full
2. Surface all items with `Status=OPEN` to the user
3. NEVER apply automated fix — pipeline mode is `audit-only` per Master `CLAUDE.md` §2d
4. For any proposed change: `propose-confirm-apply` protocol (describe change → wait for explicit "ok" → apply → log in `Reports/DIRECT-CHANGES-YYYY-MM.md`)
5. After each resolved item: update `Status=Eliminated` with date + commit hash

**Why**: Tester is a shared library + HTTP service used by Website Guru, journey-audit CLI, and all E2E audit flows. Breaking changes cascade across the ecosystem (Master §6.1 shared-dependency protocol applies). Also published as `@aledan007/tester` npm package.

---

## Open Gaps

_No gaps identified yet. This ledger was scaffolded on 2026-04-24 to comply with Master `CLAUDE.md` §2d. Populate via the next E2E Audit run (`Optimise run` / ML2 wave)._

| Gap ID | Severity | Area | Description | Status | Resolution |
|--------|----------|------|-------------|--------|------------|
| — | — | — | — | — | — |

---

## Reports index

- `Reports/AUDIT-<date>.md` — individual audit reports
- `Reports/DIRECT-CHANGES-YYYY-MM.md` — monthly Direct-session change log
