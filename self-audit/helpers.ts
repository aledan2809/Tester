import { type APIRequestContext } from '@playwright/test'

export const API_SECRET = process.env.TESTER_API_SECRET || ''
export const BASE_URL = process.env.SELF_AUDIT_URL || 'https://tester.techbiz.ae'

export function authHeaders() {
  return {
    Authorization: `Bearer ${API_SECRET}`,
    'Content-Type': 'application/json',
  }
}

export function noAuthHeaders() {
  return {
    'Content-Type': 'application/json',
  }
}

export function badAuthHeaders() {
  return {
    Authorization: 'Bearer invalid_token_12345',
    'Content-Type': 'application/json',
  }
}

export async function startTest(request: APIRequestContext, url: string, config?: Record<string, unknown>) {
  return request.post('/api/test/start', {
    headers: authHeaders(),
    data: { url, config },
  })
}

export async function getTestStatus(request: APIRequestContext, testId: string) {
  return request.get(`/api/test/${testId}/status`, {
    headers: authHeaders(),
  })
}

export async function getTestResults(request: APIRequestContext, testId: string) {
  return request.get(`/api/test/${testId}/results`, {
    headers: authHeaders(),
  })
}

export async function getTestReport(request: APIRequestContext, testId: string) {
  return request.get(`/api/test/${testId}/report`, {
    headers: authHeaders(),
  })
}

/** Wait for a test to reach a terminal state (completed/failed) or timeout */
export async function waitForTestCompletion(
  request: APIRequestContext,
  testId: string,
  timeoutMs = 120_000,
  pollMs = 3_000,
): Promise<{ status: string; body: Record<string, unknown> }> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const res = await request.get(`/api/test/${testId}/status`, { headers: authHeaders() })
    const body = await res.json()
    if (body.status === 'completed' || body.status === 'failed') {
      return { status: body.status, body }
    }
    await new Promise(r => setTimeout(r, pollMs))
  }
  throw new Error(`Test ${testId} did not complete within ${timeoutMs}ms`)
}
