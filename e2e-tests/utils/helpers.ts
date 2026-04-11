import { type APIRequestContext } from '@playwright/test'

export const API_SECRET = '33a48f8e097e5b2f6c049234175456ec6fcb4ba733e3d06adabdff73237f7160'
export const BASE_URL = 'http://localhost:3012'

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
