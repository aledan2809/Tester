/**
 * DOM Assertions Tests (unit, no real browser)
 */
import { describe, it, expect, vi } from 'vitest'
import { runDomAssertion } from '../../src/assertions/dom'
import type { TestAssertion } from '../../src/core/types'

function makeAssertion(overrides: Partial<TestAssertion> = {}): TestAssertion {
  return {
    type: 'element_exists',
    description: 'test assertion',
    ...overrides,
  }
}

// Minimal Puppeteer Page mock
function mockPage(overrides: Record<string, unknown> = {}): any {
  return {
    $: vi.fn().mockResolvedValue(null),
    evaluate: vi.fn().mockResolvedValue(''),
    url: vi.fn().mockReturnValue('https://example.com'),
    title: vi.fn().mockResolvedValue('Example'),
    cookies: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

describe('runDomAssertion', () => {
  it('element_exists — found', async () => {
    const page = mockPage({ $: vi.fn().mockResolvedValue({}) })
    const result = await runDomAssertion(page, makeAssertion({ type: 'element_exists', target: '#main' }))
    expect(result.passed).toBe(true)
  })

  it('element_exists — not found', async () => {
    const page = mockPage({ $: vi.fn().mockResolvedValue(null) })
    const result = await runDomAssertion(page, makeAssertion({ type: 'element_exists', target: '#missing' }))
    expect(result.passed).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('text_equals — match', async () => {
    const page = mockPage({ evaluate: vi.fn().mockResolvedValue('Hello World') })
    const result = await runDomAssertion(page, makeAssertion({ type: 'text_equals', target: 'h1', expected: 'Hello World' }))
    expect(result.passed).toBe(true)
    expect(result.actual).toBe('Hello World')
  })

  it('text_equals — mismatch', async () => {
    const page = mockPage({ evaluate: vi.fn().mockResolvedValue('Wrong') })
    const result = await runDomAssertion(page, makeAssertion({ type: 'text_equals', target: 'h1', expected: 'Hello' }))
    expect(result.passed).toBe(false)
  })

  it('text_contains — pass', async () => {
    const page = mockPage({ evaluate: vi.fn().mockResolvedValue('Hello World') })
    const result = await runDomAssertion(page, makeAssertion({ type: 'text_contains', target: 'h1', expected: 'World' }))
    expect(result.passed).toBe(true)
  })

  it('url_equals — pass', async () => {
    const page = mockPage({ url: vi.fn().mockReturnValue('https://example.com/page') })
    const result = await runDomAssertion(page, makeAssertion({ type: 'url_equals', expected: 'https://example.com/page' }))
    expect(result.passed).toBe(true)
  })

  it('url_contains — pass', async () => {
    const page = mockPage({ url: vi.fn().mockReturnValue('https://example.com/page?q=test') })
    const result = await runDomAssertion(page, makeAssertion({ type: 'url_contains', expected: 'q=test' }))
    expect(result.passed).toBe(true)
  })

  it('title_equals — pass', async () => {
    const page = mockPage({ title: vi.fn().mockResolvedValue('My Site') })
    const result = await runDomAssertion(page, makeAssertion({ type: 'title_equals', expected: 'My Site' }))
    expect(result.passed).toBe(true)
  })

  it('title_contains — pass', async () => {
    const page = mockPage({ title: vi.fn().mockResolvedValue('My Site Title') })
    const result = await runDomAssertion(page, makeAssertion({ type: 'title_contains', expected: 'Site' }))
    expect(result.passed).toBe(true)
  })

  it('cookie_exists — found', async () => {
    const page = mockPage({ cookies: vi.fn().mockResolvedValue([{ name: 'session', value: 'abc' }]) })
    const result = await runDomAssertion(page, makeAssertion({ type: 'cookie_exists', expected: 'session' }))
    expect(result.passed).toBe(true)
  })

  it('cookie_exists — not found', async () => {
    const page = mockPage({ cookies: vi.fn().mockResolvedValue([]) })
    const result = await runDomAssertion(page, makeAssertion({ type: 'cookie_exists', expected: 'session' }))
    expect(result.passed).toBe(false)
  })

  it('unknown type — fails', async () => {
    const page = mockPage()
    const result = await runDomAssertion(page, makeAssertion({ type: 'unknown_thing' as any }))
    expect(result.passed).toBe(false)
    expect(result.error).toContain('Unknown')
  })

  it('handles exceptions gracefully', async () => {
    const page = mockPage({ $: vi.fn().mockRejectedValue(new Error('Browser crashed')) })
    const result = await runDomAssertion(page, makeAssertion({ type: 'element_exists', target: '#x' }))
    expect(result.passed).toBe(false)
    expect(result.error).toContain('Browser crashed')
  })
})
