/**
 * Network Assertions Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { runNetworkAssertion } from '../../src/assertions/network'
import type { TestAssertion, ConsoleError, NetworkError } from '../../src/core/types'

function makeAssertion(overrides: Partial<TestAssertion> = {}): TestAssertion {
  return {
    type: 'no_console_errors',
    description: 'test',
    ...overrides,
  }
}

const emptyPage: any = {}

describe('runNetworkAssertion', () => {
  it('no_console_errors — pass when no errors', async () => {
    const result = await runNetworkAssertion(emptyPage, makeAssertion({ type: 'no_console_errors' }), [], [])
    expect(result.passed).toBe(true)
  })

  it('no_console_errors — fail with errors', async () => {
    const errors: ConsoleError[] = [
      { message: 'Uncaught TypeError', level: 'error', url: 'https://example.com' },
      { message: 'warning only', level: 'warn', url: 'https://example.com' },
    ]
    const result = await runNetworkAssertion(emptyPage, makeAssertion({ type: 'no_console_errors' }), errors, [])
    expect(result.passed).toBe(false)
    expect(result.actual).toBe(1) // Only level=error counts
    expect(result.error).toContain('1 console error')
  })

  it('no_network_errors — pass when no 4xx+', async () => {
    const errors: NetworkError[] = [
      { url: 'https://example.com/ok', statusCode: 200, resource: 'document' },
    ]
    const result = await runNetworkAssertion(emptyPage, makeAssertion({ type: 'no_network_errors' }), [], errors)
    expect(result.passed).toBe(true)
  })

  it('no_network_errors — fail with 404', async () => {
    const errors: NetworkError[] = [
      { url: 'https://example.com/missing', statusCode: 404, resource: 'document' },
    ]
    const result = await runNetworkAssertion(emptyPage, makeAssertion({ type: 'no_network_errors' }), [], errors)
    expect(result.passed).toBe(false)
    expect(result.error).toContain('404')
  })

  it('status_code — 200 assumed pass', async () => {
    const result = await runNetworkAssertion(emptyPage, makeAssertion({ type: 'status_code', expected: 200 }), [], [])
    expect(result.passed).toBe(true)
  })

  it('unknown type — fails', async () => {
    const result = await runNetworkAssertion(emptyPage, makeAssertion({ type: 'unknown_net' as any }), [], [])
    expect(result.passed).toBe(false)
    expect(result.error).toContain('Unknown')
  })
})
