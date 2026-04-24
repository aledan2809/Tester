# Tester Lessons Corpus (T-000 Active Lessons Engine)

Each `.yaml` file in this directory is a structured **Lesson** — a documented harness/product/infra pattern with detection rules, prevention hooks, diagnosis signatures, and a regression test.

Commit `ace5d34` (docs) + this directory (code) together land the Day-1 deliverable of T-000 per `TODO_PERSISTENT.md`.

## Why lessons-as-code, not lessons-as-prose

Prose lessons (memory/*.md, knowledge/lessons-learned.md) have a **59% recurrence rate** measured in Phase 0.2. Documented patterns still recur because prose doesn't execute. Lessons in this directory execute: `tester lessons scan <file>` runs the regex detectors; matching code fails CI.

## File naming

`L-<short-id>-<slug>.yaml`

- `L-<short-id>` — stable identifier. Matches schema field `id`.
- `-<slug>` — human-readable dash-cased summary. Matches schema field `slug`.

Example: `L-F2-css-ne-operator.yaml`

## Schema (required fields)

See [src/lessons/schema.ts](../src/lessons/schema.ts) for the exhaustive type. Minimum:

```yaml
id: L-F2                              # required; /^L[-_A-Za-z0-9]+$/
slug: css-ne-operator-invalid         # required
title: "human readable one-liner"     # required
first_observed: 2026-04-24            # required; ISO date
projects_hit: [procuchaingo2]         # required; [] if synthetic
contexts_hit: [cc-session]            # required; subset of cc-session|twg|pipeline
hit_count: 1                          # required; incremented by `tester lessons scan` in CI
severity: medium                      # required; info|low|medium|high|critical
tags: [selector, css]                 # required; [] if none
detection:                            # required; non-empty array
  - type: regex_in_test_file          #   required: regex_in_test_file | regex_in_source_file | ast_pattern
    pattern: 'querySelector[^)]+\[[^\]]+!='
    message: 'invalid CSS != operator'
status: active                        # required; active|muted|deprecated
```

Optional fields: `prevention` (lint_rule, auto_fix, block_commit_if_unfixed), `diagnosis` (symptom_signatures, suggested_remediation), `regression_test` (path to vitest file).

## CLI usage

```
tester lessons list                          # show all lessons in corpus
tester lessons list --severity high          # filter
tester lessons scan <file-or-dir>            # Day-1 core — detect matches
tester lessons scan tests/ --json            # CI-friendly output
```

Day-2+ commands (`diagnose`, `validate`, `stats`, `import`) land after Day-1 ships.

## Day-1 seed lessons

Covering the 3 Procu 2026-04-24 harness defects that motivated T-000:

- `L-F2` — Invalid CSS `[attr!=value]` operator (Puppeteer throws)
- `L-F8` — Case-sensitive regex vs Tailwind `uppercase` class
- `L-F10` — Unscoped text picker matches unrelated onboarding buttons

Expansion to 34+ seeds per Phase 0.4 synthesis happens in Day 3 (`tester lessons import --from ~/.claude/.../memory/*.md`).
