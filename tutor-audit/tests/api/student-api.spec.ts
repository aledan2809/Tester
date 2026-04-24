import { test, expect } from '@playwright/test'

test.describe('API - Student Endpoints (Unauthenticated)', () => {
  test('GET /api/student/dashboard returns 401', async ({ request }) => {
    const response = await request.get('/api/student/dashboard')
    expect(response.status()).toBe(401)
  })

  test('GET /api/student/domains returns 401', async ({ request }) => {
    const response = await request.get('/api/student/domains')
    expect(response.status()).toBe(401)
  })

  test('POST /api/student/sessions/quick returns 401', async ({ request }) => {
    const response = await request.post('/api/student/sessions/quick')
    expect(response.status()).toBe(401)
  })

  test('POST /api/student/sessions/continue returns 401', async ({ request }) => {
    const response = await request.post('/api/student/sessions/continue')
    expect(response.status()).toBe(401)
  })

  test('GET /api/student/assessment returns 401', async ({ request }) => {
    const response = await request.get('/api/student/assessment')
    expect(response.status()).toBe(401)
  })

  test('POST /api/student/assessment returns 401', async ({ request }) => {
    const response = await request.post('/api/student/assessment', {
      data: { domainId: 'test', answers: [] },
    })
    expect(response.status()).toBe(401)
  })
})

test.describe('API - Domain Endpoints (Unauthenticated)', () => {
  test('GET /api/aviation/progress returns 401', async ({ request }) => {
    const response = await request.get('/api/aviation/progress')
    expect(response.status()).toBe(401)
  })

  test('GET /api/aviation/leaderboard returns 401', async ({ request }) => {
    const response = await request.get('/api/aviation/leaderboard')
    expect(response.status()).toBe(401)
  })

  test('GET /api/aviation/achievements returns 401', async ({ request }) => {
    const response = await request.get('/api/aviation/achievements')
    expect(response.status()).toBe(401)
  })

  test('GET /api/aviation/xp returns 401', async ({ request }) => {
    const response = await request.get('/api/aviation/xp')
    expect(response.status()).toBe(401)
  })

  test('GET /api/aviation/streak returns 401', async ({ request }) => {
    const response = await request.get('/api/aviation/streak')
    expect(response.status()).toBe(401)
  })

  test('GET /api/aviation/daily-challenge returns 401', async ({ request }) => {
    const response = await request.get('/api/aviation/daily-challenge')
    expect(response.status()).toBe(401)
  })

  test('POST /api/aviation/session/start returns 401', async ({ request }) => {
    const response = await request.post('/api/aviation/session/start', {
      data: { type: 'quick' },
    })
    expect(response.status()).toBe(401)
  })

  test('POST /api/aviation/session/answer returns 401', async ({ request }) => {
    const response = await request.post('/api/aviation/session/answer', {
      data: { sessionId: 'fake', questionId: 'fake', answer: 'A' },
    })
    expect(response.status()).toBe(401)
  })

  test('POST /api/aviation/session/complete returns 401', async ({ request }) => {
    const response = await request.post('/api/aviation/session/complete', {
      data: { sessionId: 'fake' },
    })
    expect(response.status()).toBe(401)
  })

  test('GET /api/aviation/session/next returns 401', async ({ request }) => {
    const response = await request.get('/api/aviation/session/next')
    expect(response.status()).toBe(401)
  })

  test('POST /api/aviation/exam/start returns 401', async ({ request }) => {
    const response = await request.post('/api/aviation/exam/start', {
      data: { formatId: 'fake', mode: 'PRACTICE' },
    })
    expect(response.status()).toBe(401)
  })

  test('GET /api/aviation/exam/history returns 401', async ({ request }) => {
    const response = await request.get('/api/aviation/exam/history')
    expect(response.status()).toBe(401)
  })

  test('GET /api/aviation/exam/formats returns 401', async ({ request }) => {
    const response = await request.get('/api/aviation/exam/formats')
    expect(response.status()).toBe(401)
  })

  test('GET /api/aviation/calendar/status returns 401', async ({ request }) => {
    const response = await request.get('/api/aviation/calendar/status')
    expect(response.status()).toBe(401)
  })
})

test.describe('API - Notification Endpoints (Unauthenticated)', () => {
  test('GET /api/notifications returns 401', async ({ request }) => {
    const response = await request.get('/api/notifications')
    expect(response.status()).toBe(401)
  })

  test('GET /api/notifications/preferences returns 401', async ({ request }) => {
    const response = await request.get('/api/notifications/preferences')
    expect(response.status()).toBe(401)
  })
})

test.describe('API - Response Format', () => {
  test('401 responses should return JSON', async ({ request }) => {
    const response = await request.get('/api/student/dashboard')
    const contentType = response.headers()['content-type']
    expect(contentType).toContain('application/json')
  })

  test('404 API responses should not leak internals', async ({ request }) => {
    const response = await request.get('/api/nonexistent/endpoint')
    if (response.status() === 404) {
      const body = await response.text()
      expect(body).not.toContain('node_modules')
      expect(body).not.toContain('Error:')
    }
  })
})
