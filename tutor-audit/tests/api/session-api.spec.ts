import { test, expect } from '@playwright/test'

test.describe('Session API - Auth Enforcement', () => {
  test('POST /api/aviation/session/start requires auth', async ({ request }) => {
    const response = await request.post('/api/aviation/session/start', {
      data: { type: 'quick' }
    })
    expect(response.status()).toBe(401)
  })

  test('POST /api/aviation/session/answer requires auth', async ({ request }) => {
    const response = await request.post('/api/aviation/session/answer', {
      data: { questionId: '1', answer: 'A' }
    })
    expect(response.status()).toBe(401)
  })

  test('POST /api/aviation/session/complete requires auth', async ({ request }) => {
    const response = await request.post('/api/aviation/session/complete', {
      data: { sessionId: 'test-session' }
    })
    expect(response.status()).toBe(401)
  })

  test('GET /api/aviation/session/next requires auth', async ({ request }) => {
    const response = await request.get('/api/aviation/session/next')
    expect(response.status()).toBe(401)
  })
})

test.describe('Exam API - Auth Enforcement', () => {
  test('POST /api/aviation/exam/start requires auth', async ({ request }) => {
    const response = await request.post('/api/aviation/exam/start', {
      data: { formatId: 'test', mode: 'PRACTICE' }
    })
    expect(response.status()).toBe(401)
  })

  test('POST /api/aviation/exam/submit requires auth', async ({ request }) => {
    const response = await request.post('/api/aviation/exam/submit', {
      data: { sessionId: 'test' }
    })
    expect(response.status()).toBe(401)
  })

  test('GET /api/aviation/exam/formats requires auth', async ({ request }) => {
    const response = await request.get('/api/aviation/exam/formats')
    expect(response.status()).toBe(401)
  })

  test('GET /api/aviation/exam/history requires auth', async ({ request }) => {
    const response = await request.get('/api/aviation/exam/history')
    expect(response.status()).toBe(401)
  })
})

test.describe('Progress & Settings API - Auth Enforcement', () => {
  test('GET /api/student/progress requires auth', async ({ request }) => {
    const response = await request.get('/api/student/progress')
    expect(response.status()).toBe(401)
  })

  test('GET /api/student/assessment requires auth', async ({ request }) => {
    const response = await request.get('/api/student/assessment')
    expect(response.status()).toBe(401)
  })

  test('GET /api/student/sessions/continue requires auth', async ({ request }) => {
    const response = await request.get('/api/student/sessions/continue')
    expect(response.status()).toBe(401)
  })

  test('POST /api/settings/study-hours requires auth', async ({ request }) => {
    const response = await request.post('/api/settings/study-hours', {
      data: { hours: 2 }
    })
    expect(response.status()).toBe(401)
  })
})

test.describe('Escalation API - Auth Enforcement', () => {
  test('GET /api/escalation/some-user-id requires auth', async ({ request }) => {
    const response = await request.get('/api/escalation/some-user-id')
    expect(response.status()).toBe(401)
  })

  test('POST /api/cron/escalation without auth returns error', async ({ request }) => {
    const response = await request.post('/api/cron/escalation')
    expect([401, 403]).toContain(response.status())
  })
})

test.describe('Admin Content API - Auth Enforcement', () => {
  test('POST /api/admin/content/import requires auth', async ({ request }) => {
    const response = await request.post('/api/admin/content/import', {
      data: { content: 'test' }
    })
    expect(response.status()).toBe(401)
  })

  test('GET /api/admin/tags requires auth', async ({ request }) => {
    const response = await request.get('/api/admin/tags')
    expect(response.status()).toBe(401)
  })

  test('POST /api/admin/tags requires auth', async ({ request }) => {
    const response = await request.post('/api/admin/tags', {
      data: { name: 'test-tag' }
    })
    expect(response.status()).toBe(401)
  })

  test('GET /api/admin/ads requires auth', async ({ request }) => {
    const response = await request.get('/api/admin/ads')
    expect(response.status()).toBe(401)
  })

  test('GET /api/admin/revenue requires auth', async ({ request }) => {
    const response = await request.get('/api/admin/revenue')
    expect(response.status()).toBe(401)
  })
})
