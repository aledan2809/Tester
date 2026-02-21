/**
 * Session Persistence Tests
 */
import { describe, it, expect } from 'vitest'
import { isSessionValid } from '../../src/auth/session'
import { join } from 'path'

describe('session', () => {
  it('isSessionValid returns false for non-existent file', () => {
    expect(isSessionValid('/tmp/nonexistent-session-12345.json')).toBe(false)
  })

  it('isSessionValid returns false for expired session', () => {
    // Even if file exists, maxAge of 0 means always expired
    const fakeFile = join(__dirname, '..', '..', 'package.json') // exists
    expect(isSessionValid(fakeFile, 0)).toBe(false)
  })
})
