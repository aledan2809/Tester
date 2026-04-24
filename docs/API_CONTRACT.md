# @aledan007/tester — Public API Contract (T-D2)

**Last updated:** 2026-04-24 (wave 2)

## Stability tiers

| Tier | Guarantee | Semver reaction to a break |
|------|-----------|---------------------------|
| 1 — Stable | CLI commands + documented flags; `AITester`, executor entries, reporter generators, assertion runners, all type re-exports | **Major** bump |
| 2 — Public, minor-mutable | Wave 1+2 helpers (untested, snapshot, a11y, perf, scaffolder, session, scoring, regression, triage, affected, pipeline-stats, done) | **Minor** bump + CHANGELOG entry |
| 3 — Internal | `src/server/**` HTTP surface, `src/lessons/scanner.ts` internals, any un-re-exported module | **Patch** (no API promise) |

## Tier 1 — stable surface (semver-locked)

### CLI commands

Removing or renaming any of the following is a **major** break:

```
tester discover        tester run          tester login
tester report          tester audit        tester audit-only
tester journey-audit   tester lessons      tester selfcheck
tester coverage        tester generate     tester untested
tester zombie-scan     tester snapshot     tester a11y
tester perf            tester init         tester session
tester score           tester regression   tester triage
tester affected        tester pipeline-stats
tester done            tester undone       tester status
```

Adding flags to existing commands is **patch**. Removing / renaming flags is **minor**.

### Core library exports (do not rename without a major)

- `AITester` (src/tester.ts)
- `BrowserCore`
- `executeScenarios`
- `runAssertion`, `runDomAssertion`, `runNetworkAssertion`, `runVisualAssertion`, `runA11yAssertion`, `runA11yScan`, `runPerformanceAssertion`, `capturePerformanceMetrics`
- Reporter: `generateReports`, `generateJsonReport`, `generateHtmlReport`, `generateHtmlString`, `formatCiSummary`
- Type re-exports: `TesterConfig`, `TestScenario`, `ScenarioResult`, `AssertionResult`, `TestRun`, `TestSummary`, `StepResult`, `TestStep`, `LoginCredentials`, etc.

### Exit codes

- `0` — success / nothing to report
- `1` — documented failure (budget breach, regression, critical-missing, etc.)
- `2` — bad invocation (missing args, parse errors, unreadable project path)

## Tier 2 — wave 1 / wave 2 public helpers

Each helper documented in its module docstring. Consumers may import these for programmatic use. Breaking API changes require a **minor** bump.

| Module | Entry points |
|--------|--------------|
| `untested/loader` | `buildUntestedReport`, `UntestedReport`, `UntestedSource` |
| `snapshot/store` | `LocalFSStore`, `S3Store`, `sanitizeRoute`, `BaselineStore` |
| `snapshot/compare` | `compareRoute`, `pixelDiffPercent`, `CompareResult` |
| `a11y/baseline` | `storeA11yBaseline`, `loadA11yBaseline`, `diffA11yAgainstBaseline`, `summarizeA11yDiff` |
| `a11y/budget` | `loadA11yBudget`, `checkA11yBudget` |
| `perf/budget` | `loadPerfBudget`, `evaluatePerfBudget`, `computePerfDelta`, `renderPerfCiComment` |
| `init/scaffolder` | `initFeature`, `loadFeaturesIndex` |
| `session/recorder` | `startSession`, `appendEvent`, `endSession`, `loadLatestSession`, `listSessions` |
| `scoring/twg` | `computeTwgScore`, `renderTwgScoreAscii` |
| `regression/store` | `addRegression`, `listRegressions`, `expireRegression`, `isRegressionExpired` |
| `triage/decision` | `triageFailure`, `accumulateSplit`, `emptySplit` |
| `affected/mapper` | `findAffectedFiles`, `indexTaggedFiles`, `walkTestFiles`, `parseTagsFromHeader` |
| `pipeline-stats/analyzer` | `analyzePipelines`, `renderStatsMarkdown`, `normalizePipelineSignature` |
| `done/gate` | `evaluateDone`, `markDone`, `markUndone`, `readDoneStatus` |

`src/executor.ts` also exports `retryStepWithBackoff` (T-007) for programmatic retry unit tests; stable.

## Tier 3 — internal (no API promise)

- `src/server/**` — HTTP server. **Planned split:** a future `@aledan007/tester-service` package will own this. Import from `@aledan007/tester` for library use only; do not couple to internals.
- Anything exported ad-hoc from a `src/.../internals.ts` file (none today; reserved pattern).

## Package split roadmap (T-D2 follow-up — deferred this commit)

Goal: ship a separate `@aledan007/tester-service` package that depends on `@aledan007/tester` for library logic. The current combined package continues to include the CLI and lib surface until a major bump.

Plan:

1. Extract `src/server/**` into a sibling package under a monorepo (pnpm workspace).
2. `@aledan007/tester-service` depends on `@aledan007/tester@^X.Y.0`.
3. Existing `npx @aledan007/tester server` invocation becomes `npx @aledan007/tester-service`.
4. Release cycle: lib patches freely; service follows lib's minor/major.

No action today beyond freezing the `src/server/**` surface as Tier 3 so consumers know not to import from `@aledan007/tester` for HTTP flows.

## Deprecation policy

1. Mark with `@deprecated` JSDoc + CHANGELOG entry ≥ 2 minor versions before removal.
2. Log a `console.warn` at runtime when the deprecated path is hit (exactly once per process).
3. Remove in the next major (after the 2-minor window).

## How to change the contract

- Renaming / removing **Tier 1** → add a deprecation shim + open an issue + ship major bump.
- Renaming / removing **Tier 2** → update CHANGELOG + ship minor bump.
- Adding new helpers → additive, patch.
- Fixing a bug where the behavior was undocumented → patch, but document the new behavior in the module docstring + this file.
