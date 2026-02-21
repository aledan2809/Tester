/**
 * Safety Layer Tests
 */
import { describe, it, expect } from 'vitest'
import {
  isDomainAllowed,
  shouldSkipUrl,
  validateStep,
  validateSteps,
  createTimeoutGuard,
} from '../../src/core/safety'
import type { TestStep, TesterConfig } from '../../src/core/types'

describe('isDomainAllowed', () => {
  it('allows any domain when allowedDomains is empty', () => {
    expect(isDomainAllowed('https://example.com', [])).toBe(true)
  })

  it('allows exact domain match', () => {
    expect(isDomainAllowed('https://techbiz.ae/page', ['techbiz.ae'])).toBe(true)
  })

  it('allows www prefix', () => {
    expect(isDomainAllowed('https://www.techbiz.ae', ['techbiz.ae'])).toBe(true)
  })

  it('allows subdomain match', () => {
    expect(isDomainAllowed('https://blog.techbiz.ae', ['techbiz.ae'])).toBe(true)
  })

  it('blocks different domain', () => {
    expect(isDomainAllowed('https://evil.com', ['techbiz.ae'])).toBe(false)
  })

  it('handles URL without protocol', () => {
    expect(isDomainAllowed('techbiz.ae/path', ['techbiz.ae'])).toBe(true)
  })

  it('handles invalid URL', () => {
    expect(isDomainAllowed('not a url', ['techbiz.ae'])).toBe(false)
  })
})

describe('shouldSkipUrl', () => {
  it('skips logout URLs', () => {
    expect(shouldSkipUrl('https://site.com/logout')).toBe(true)
    expect(shouldSkipUrl('https://site.com/sign-out')).toBe(true)
    expect(shouldSkipUrl('https://site.com/signout')).toBe(true)
  })

  it('skips mailto and tel', () => {
    expect(shouldSkipUrl('mailto:test@example.com')).toBe(true)
    expect(shouldSkipUrl('tel:+1234567890')).toBe(true)
  })

  it('skips javascript: URLs', () => {
    expect(shouldSkipUrl('javascript:void(0)')).toBe(true)
  })

  it('skips user-defined patterns', () => {
    expect(shouldSkipUrl('https://site.com/admin/settings', ['/admin'])).toBe(true)
  })

  it('allows normal URLs', () => {
    expect(shouldSkipUrl('https://site.com/about')).toBe(false)
    expect(shouldSkipUrl('https://site.com/contact')).toBe(false)
  })
})

describe('validateStep', () => {
  const config: TesterConfig = { allowedDomains: ['techbiz.ae'] }

  it('allows navigation within allowed domains', () => {
    const step: TestStep = { action: 'navigate', value: 'https://techbiz.ae/about', description: 'test' }
    expect(validateStep(step, config, 'https://techbiz.ae').ok).toBe(true)
  })

  it('blocks navigation outside allowed domains', () => {
    const step: TestStep = { action: 'navigate', value: 'https://evil.com', description: 'test' }
    const result = validateStep(step, config, 'https://techbiz.ae')
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('outside allowed domains')
  })

  it('blocks dangerous evaluate scripts', () => {
    const step: TestStep = { action: 'evaluate', value: 'document.cookie = "x"', description: 'test' }
    expect(validateStep(step, {}, '').ok).toBe(false)
  })

  it('allows safe evaluate scripts', () => {
    const step: TestStep = { action: 'evaluate', value: 'document.title', description: 'test' }
    expect(validateStep(step, {}, '').ok).toBe(true)
  })

  it('blocks dangerous WP URLs', () => {
    const step: TestStep = { action: 'navigate', value: 'https://techbiz.ae/wp-admin/options.php', description: 'test' }
    const result = validateStep(step, config, 'https://techbiz.ae')
    expect(result.ok).toBe(false)
  })
})

describe('validateSteps', () => {
  it('rejects empty steps', () => {
    const result = validateSteps([], {}, 'https://site.com')
    expect(result.ok).toBe(false)
    expect(result.issues).toContain('No steps to execute')
  })

  it('rejects steps > 100', () => {
    const steps = Array.from({ length: 101 }, (_, i) => ({
      action: 'click' as const,
      target: '#btn',
      description: `step ${i}`,
    }))
    const result = validateSteps(steps, {}, 'https://site.com')
    expect(result.ok).toBe(false)
  })

  it('requires target for click actions', () => {
    const steps: TestStep[] = [{ action: 'click', description: 'no target' }]
    const result = validateSteps(steps, {}, 'https://site.com')
    expect(result.ok).toBe(false)
    expect(result.issues[0]).toContain('requires target')
  })

  it('allows click with aiDescription', () => {
    const steps: TestStep[] = [{ action: 'click', aiDescription: 'the submit button', description: 'click submit' }]
    const result = validateSteps(steps, {}, 'https://site.com')
    expect(result.ok).toBe(true)
  })

  it('requires value for fill actions', () => {
    const steps: TestStep[] = [{ action: 'fill', target: '#input', description: 'fill' }]
    const result = validateSteps(steps, {}, 'https://site.com')
    expect(result.ok).toBe(false)
    expect(result.issues[0]).toContain('requires a value')
  })

  it('validates navigate URL value', () => {
    const steps: TestStep[] = [{ action: 'navigate', description: 'go' }]
    const result = validateSteps(steps, {}, 'https://site.com')
    expect(result.ok).toBe(false)
    expect(result.issues[0]).toContain('requires a URL')
  })

  it('accepts valid plan', () => {
    const steps: TestStep[] = [
      { action: 'navigate', value: 'https://site.com', description: 'go' },
      { action: 'click', target: '#btn', description: 'click' },
      { action: 'fill', target: '#input', value: 'hello', description: 'fill' },
    ]
    const result = validateSteps(steps, {}, 'https://site.com')
    expect(result.ok).toBe(true)
  })
})

describe('createTimeoutGuard', () => {
  it('does not abort before timeout', () => {
    const guard = createTimeoutGuard(1000)
    expect(guard.signal.aborted).toBe(false)
    guard.clear()
  })

  it('aborts after timeout', async () => {
    const guard = createTimeoutGuard(50)
    await new Promise(r => setTimeout(r, 100))
    expect(guard.signal.aborted).toBe(true)
  })

  it('can be cleared', async () => {
    const guard = createTimeoutGuard(50)
    guard.clear()
    await new Promise(r => setTimeout(r, 100))
    expect(guard.signal.aborted).toBe(false)
  })
})
