import { test, expect } from '@playwright/test'
import { authHeaders } from './helpers'

test.describe('Self-Audit: POST /api/test/start', () => {
  test('rejects missing url', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: {},
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('url')
  })

  test('rejects invalid url', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: { url: ':::invalid' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Invalid')
  })

  test('accepts valid url and returns 202 with testId', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: {
        url: 'https://example.com',
        config: { maxPages: 1, maxDepth: 1, crawlTimeout: 15000 },
      },
    })
    // 202 = accepted, 429 = busy (another test running)
    expect([202, 429]).toContain(res.status())
    const body = await res.json()
    if (res.status() === 202) {
      expect(body.testId).toBeDefined()
      expect(body.status).toBe('queued')
    } else {
      expect(body.error).toContain('busy')
    }
  })
})
