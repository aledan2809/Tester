# Scenario matrix patterns

TWG / `tester done` / coverage scoring all depend on `coverage/*.yaml`
being **exhaustive** and **honestly labelled**. This doc collects the
declaration patterns that have worked across ecosystem projects.

## Shape

```yaml
feature: four-way-match
owner: procuchaingo2
scenarios:
  - id: Q1
    name: invoice qty > received (over-invoicing)
    category: quantity
    severity: high
    covered_by: tests/matching/over-invoice.spec.ts::test_over_invoice
    status: covered                # covered | missing | skipped | unknown
  - id: Q2
    name: invoice qty < received
    category: quantity
    severity: medium
    covered_by: null
    status: missing
references:
  - https://example.com/spec/4wm
```

Sort scenarios by category, then by severity desc, then by id. Keep
`covered_by` as `file::testname` so `tester untested` + `tester done`
can trace.

## Severity ladder

| Severity | Fires regression? | `tester done` blocks? |
|----------|-------------------|-----------------------|
| critical | Yes (T-009 a11y, T-008 visual) | **Yes** |
| high | Yes (crit+serious only in a11y) | Yes if `--fail-under` un-met |
| medium | — | Yes if ratio under threshold |
| low | — | — |
| info | — | — |

## Categories that have reused well

- `smoke` — 1 or 2 scenarios that prove the feature mounts at all
- `auth` — negative (401 / 403) + positive (logged-in happy path)
- `input-validation` — missing required, out-of-range numbers, too-long
  strings, unicode edge cases
- `crud` — create/read/update/delete; include unique-constraint tests
- `state-transitions` — pending → accepted → rejected, idempotency
- `authorization` — scope checks, cross-tenant isolation
- `edge-cases` — empty list, single item, max list, pagination turns
- `concurrency` — two concurrent writes (optimistic locking)

`tester generate --from-prisma` covers the first 5 automatically; you
fill in state-transitions + authorization + concurrency by hand.

## The 4-way-match worked example (28 scenarios)

This is the matrix from the procuchaingo2 session that inspired T-001 /
T-002 / T-003 in the first place. Ship it with every procurement-style
feature as a baseline.

| Category | # | Example |
|----------|---|---------|
| quantity | 6 | over-invoicing, under-invoicing, zero, negative, partial-received, excess-received |
| price | 6 | price > PO, price < PO, zero, negative, currency mismatch, decimal overflow |
| vendor | 4 | unknown vendor, blocked vendor, duplicate PO, expired contract |
| dates | 4 | invoice before receipt, invoice after PO expiry, future-dated, stale |
| identity | 4 | wrong PO ref, wrong line-item id, cross-project match, missing ref |
| permissions | 4 | admin-only override, non-admin attempt, tenant isolation, role escalation |

= 28 scenarios. `coverage/four-way-match.yaml` declares all 28;
`tester coverage --feature coverage/four-way-match.yaml --fail-under 0.9`
gates the branch.

## When to add a scenario

- A bug report arrived → add scenario + T-B2 regression spec.
- A code review comment "what about when X is empty?" → add scenario.
- You hand-tested a flow in the browser → encode it before forgetting.
- A pipeline failure surfaced a failure signature not in the matrix →
  add scenario + tag the T-000 lesson that covers the class.

## When NOT to add a scenario

- You can't describe the failure mode in 1 sentence — don't encode it;
  write prose in `knowledge/` first.
- The scenario is a harness concern (not product) — belongs in T-000
  lessons corpus, not `coverage/*.yaml`.

## Sealing a feature

```bash
# After tests pass:
tester done four-way-match \
  --tests-passing 28 --tests-total 28 \
  --commit abc1234
```

This writes `status: done` + `done_at` + `done_commit` into
`coverage/features.yaml`. `tester status` then shows the feature as
sealed. Reopen with `tester undone four-way-match` when a regression
forces rework.
