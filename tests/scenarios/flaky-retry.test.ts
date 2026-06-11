/**
 * Tests — flaky re-run detection in runScenarios (S7).
 * Uses the injectable loader + a temp suite dir so no browser/network is needed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { runScenarios, classifyFlaky, type ScenarioFn, type ScenarioOutcome } from '../../src/scenarios/runner'

let suiteDir: string

beforeAll(() => {
  suiteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flaky-suite-'))
  // Two scenario files so discoverScenarios finds them; behavior is driven by
  // the injected loader keyed on filename, not the file contents.
  for (const n of ['steady', 'flaky']) fs.writeFileSync(path.join(suiteDir, `${n}.scenario.ts`), 'export const runScenario = async () => ({})')
})
afterAll(() => fs.rmSync(suiteDir, { recursive: true, force: true }))

const PASS: ScenarioOutcome = { status: 'PASS', durationMs: 1 }
const FAIL: ScenarioOutcome = { status: 'FAIL', error: 'boom', durationMs: 1 }

/** Loader where `flaky.scenario` FAILs on call 1, PASSes on call 2; everything else steady-PASS. */
function flakyLoader(steadyOutcome: ScenarioOutcome = PASS) {
  const calls: Record<string, number> = {}
  const loader = async (filePath: string): Promise<{ runScenario: ScenarioFn }> => {
    const base = path.basename(filePath)
    return {
      runScenario: async () => {
        calls[base] = (calls[base] || 0) + 1
        if (base.startsWith('flaky')) return calls[base] === 1 ? FAIL : PASS
        return steadyOutcome
      },
    }
  }
  return { loader, calls }
}

describe('classifyFlaky', () => {
  it('FAIL then PASS → flaky', () => expect(classifyFlaky(FAIL, PASS)).toBe(true))
  it('FAIL then FAIL → not flaky (hard fail)', () => expect(classifyFlaky(FAIL, FAIL)).toBe(false))
  it('PASS then anything → not flaky', () => expect(classifyFlaky(PASS, FAIL)).toBe(false))
})

describe('runScenarios retryFlaky', () => {
  it('default (off) → no re-run, flaky undefined/0', async () => {
    const { loader, calls } = flakyLoader()
    const r = await runScenarios({ suiteDir, loader })
    expect(calls['flaky.scenario.ts']).toBe(1) // ran once, not retried
    expect(r.fail).toBe(1)
    expect(r.flaky ?? 0).toBe(0)
  })

  it('retryFlaky on → re-runs the FAIL, flags it flaky', async () => {
    const { loader, calls } = flakyLoader()
    const r = await runScenarios({ suiteDir, loader, retryFlaky: true })
    expect(calls['flaky.scenario.ts']).toBe(2) // ran + retried
    expect(calls['steady.scenario.ts']).toBe(1) // PASS never retried
    expect(r.flaky).toBe(1)
    const flakyResult = r.results.find((x) => x.name.startsWith('flaky'))!
    expect(flakyResult.flaky).toBe(true)
    expect(flakyResult.outcome.status).toBe('FAIL') // conservative: outcome stays FAIL
    expect(flakyResult.logs.some((l) => l.includes('flaky'))).toBe(true)
  })

  it('hard failure (fails both times) → NOT flagged flaky', async () => {
    const loader = async (): Promise<{ runScenario: ScenarioFn }> => ({ runScenario: async () => FAIL })
    const r = await runScenarios({ suiteDir, loader, retryFlaky: true })
    expect(r.flaky).toBe(0)
    expect(r.results.every((x) => !x.flaky)).toBe(true)
  })

  it('TESTER_RETRY_FLAKY=1 env enables it without the option', async () => {
    const prev = process.env.TESTER_RETRY_FLAKY
    process.env.TESTER_RETRY_FLAKY = '1'
    try {
      const { loader } = flakyLoader()
      const r = await runScenarios({ suiteDir, loader })
      expect(r.flaky).toBe(1)
    } finally {
      if (prev === undefined) delete process.env.TESTER_RETRY_FLAKY
      else process.env.TESTER_RETRY_FLAKY = prev
    }
  })
})
