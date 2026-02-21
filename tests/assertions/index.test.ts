/**
 * Assertion Router Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { runAssertion } from '../../src/assertions/index'
import type { TestAssertion } from '../../src/core/types'

function makeAssertion(overrides: Partial<TestAssertion> = {}): TestAssertion {
  return {
    type: 'element_exists',
    description: 'test',
    ...overrides,
  }
}

function mockPage(overrides: Record<string, unknown> = {}): any {
  return {
    $: vi.fn().mockResolvedValue({}),
    evaluate: vi.fn().mockResolvedValue(''),
    url: vi.fn().mockReturnValue('https://example.com'),
    title: vi.fn().mockResolvedValue('Test'),
    cookies: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

describe('runAssertion router', () => {
  it('routes DOM types to DOM handler', async () => {
    const page = mockPage({ $: vi.fn().mockResolvedValue({}) })
    const result = await runAssertion(page, makeAssertion({ type: 'element_exists', target: 'h1' }), {
      consoleErrors: [],
      networkErrors: [],
    })
    expect(result.passed).toBe(true)
  })

  it('routes network types to network handler', async () => {
    const result = await runAssertion({} as any, makeAssertion({ type: 'no_console_errors' }), {
      consoleErrors: [],
      networkErrors: [],
    })
    expect(result.passed).toBe(true)
  })

  it('routes visual type — skips if no screenshots', async () => {
    const result = await runAssertion({} as any, makeAssertion({ type: 'visual_no_regression' }), {
      consoleErrors: [],
      networkErrors: [],
    })
    expect(result.passed).toBe(true) // Skipped = pass
  })

  it('unknown type returns failure', async () => {
    const result = await runAssertion({} as any, makeAssertion({ type: 'totally_unknown' as any }), {
      consoleErrors: [],
      networkErrors: [],
    })
    expect(result.passed).toBe(false)
    expect(result.error).toContain('Unknown assertion type')
  })
})
