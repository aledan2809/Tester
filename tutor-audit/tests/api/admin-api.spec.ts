import { test, expect } from '@playwright/test'

test.describe('API - Admin Endpoints (Unauthenticated)', () => {
  test('GET /api/admin/users returns 401', async ({ request }) => {
    const response = await request.get('/api/admin/users')
    expect(response.status()).toBe(401)
  })

  test('POST /api/admin/users returns 401', async ({ request }) => {
    const response = await request.post('/api/admin/users', {
      data: { email: 'test@test.com', name: 'Test' },
    })
    expect(response.status()).toBe(401)
  })

  test('GET /api/admin/domains returns 401', async ({ request }) => {
    const response = await request.get('/api/admin/domains')
    expect(response.status()).toBe(401)
  })

  test('POST /api/admin/domains returns 401', async ({ request }) => {
    const response = await request.post('/api/admin/domains', {
      data: { name: 'Test Domain', slug: 'test' },
    })
    expect(response.status()).toBe(401)
  })

  test('GET /api/admin/questions returns 401', async ({ request }) => {
    const response = await request.get('/api/admin/questions')
    expect(response.status()).toBe(401)
  })

  test('POST /api/admin/questions returns 401', async ({ request }) => {
    const response = await request.post('/api/admin/questions', {
      data: { content: 'Test?', type: 'multiple_choice' },
    })
    expect(response.status()).toBe(401)
  })

  test('POST /api/admin/questions/bulk-import returns 401', async ({ request }) => {
    const response = await request.post('/api/admin/questions/bulk-import')
    expect(response.status()).toBe(401)
  })

  test('POST /api/admin/questions/ai-generate returns 401', async ({ request }) => {
    const response = await request.post('/api/admin/questions/ai-generate', {
      data: { topic: 'test' },
    })
    expect(response.status()).toBe(401)
  })

  test('GET /api/admin/plans returns 401', async ({ request }) => {
    const response = await request.get('/api/admin/plans')
    expect(response.status()).toBe(401)
  })

  test('GET /api/admin/vouchers returns 401', async ({ request }) => {
    const response = await request.get('/api/admin/vouchers')
    expect(response.status()).toBe(401)
  })

  test('GET /api/admin/audit returns 401', async ({ request }) => {
    const response = await request.get('/api/admin/audit')
    expect(response.status()).toBe(401)
  })

  test('GET /api/admin/revenue returns 401', async ({ request }) => {
    const response = await request.get('/api/admin/revenue')
    expect(response.status()).toBe(401)
  })

  test('GET /api/admin/tags returns 401', async ({ request }) => {
    const response = await request.get('/api/admin/tags')
    expect(response.status()).toBe(401)
  })
})

test.describe('API - Instructor Endpoints (Unauthenticated)', () => {
  test('GET /api/dashboard/instructor returns 401', async ({ request }) => {
    const response = await request.get('/api/dashboard/instructor')
    expect(response.status()).toBe(401)
  })

  test('GET /api/dashboard/instructor/groups returns 401', async ({ request }) => {
    const response = await request.get('/api/dashboard/instructor/groups')
    expect(response.status()).toBe(401)
  })

  test('GET /api/dashboard/instructor/goals returns 401', async ({ request }) => {
    const response = await request.get('/api/dashboard/instructor/goals')
    expect(response.status()).toBe(401)
  })

  test('GET /api/dashboard/instructor/messages returns 401', async ({ request }) => {
    const response = await request.get('/api/dashboard/instructor/messages')
    expect(response.status()).toBe(401)
  })

  test('GET /api/dashboard/instructor/analytics returns 401', async ({ request }) => {
    const response = await request.get('/api/dashboard/instructor/analytics')
    expect(response.status()).toBe(401)
  })

  test('GET /api/dashboard/instructor/students returns 401', async ({ request }) => {
    const response = await request.get('/api/dashboard/instructor/students')
    expect(response.status()).toBe(401)
  })
})

test.describe('API - Watcher Endpoints (Unauthenticated)', () => {
  test('GET /api/dashboard/watcher returns 401', async ({ request }) => {
    const response = await request.get('/api/dashboard/watcher')
    expect(response.status()).toBe(401)
  })

  test('POST /api/dashboard/watcher returns 401', async ({ request }) => {
    const response = await request.post('/api/dashboard/watcher', {
      data: { studentId: 'fake' },
    })
    expect(response.status()).toBe(401)
  })
})

test.describe('API - Exam Format Admin (Unauthenticated)', () => {
  test('GET /api/admin/domain/aviation/exam-format returns 401', async ({ request }) => {
    const response = await request.get('/api/admin/domain/aviation/exam-format')
    expect(response.status()).toBe(401)
  })

  test('POST /api/admin/domain/aviation/exam-format returns 401', async ({ request }) => {
    const response = await request.post('/api/admin/domain/aviation/exam-format', {
      data: { name: 'Test Format' },
    })
    expect(response.status()).toBe(401)
  })
})
