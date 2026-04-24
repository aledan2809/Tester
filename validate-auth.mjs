#!/usr/bin/env node
/**
 * Authentication Validation Script
 * Tests all authentication endpoints and flows
 */

const API_BASE = 'http://localhost:3012'
const TEST_API_KEY = process.env.TESTER_API_SECRET || 'tester_test-key-min-32-chars-total'

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

async function test(name, fn) {
  try {
    process.stdout.write(`${colors.cyan}Testing: ${name}${colors.reset} ... `)
    await fn()
    console.log(`${colors.green}✓ PASS${colors.reset}`)
    return true
  } catch (err) {
    console.log(`${colors.red}✗ FAIL${colors.reset}`)
    console.error(`  Error: ${err.message}`)
    return false
  }
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const contentType = response.headers.get('content-type')
  let data
  if (contentType?.includes('application/json')) {
    data = await response.json()
  } else {
    data = await response.text()
  }

  return { response, data, status: response.status }
}

async function main() {
  log('\n=== Authentication Validation Tests ===\n', 'cyan')

  let passed = 0
  let failed = 0
  let sessionToken = null

  // Test 1: Health check (no auth)
  if (await test('Health check endpoint (public)', async () => {
    const { data, status } = await request('/api/health')
    if (status !== 200) throw new Error(`Expected 200, got ${status}`)
    if (!data.ok) throw new Error('Health check failed')
  })) passed++; else failed++

  // Test 2: Protected endpoint without auth
  if (await test('Protected endpoint without auth (should fail)', async () => {
    const { status } = await request('/api/test/start', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com' }),
    })
    if (status !== 401) throw new Error(`Expected 401, got ${status}`)
  })) passed++; else failed++

  // Test 3: Protected endpoint with invalid auth
  if (await test('Protected endpoint with invalid token', async () => {
    const { status } = await request('/api/test/start', {
      method: 'POST',
      headers: { Authorization: 'Bearer invalid-token' },
      body: JSON.stringify({ url: 'https://example.com' }),
    })
    if (status !== 403) throw new Error(`Expected 403, got ${status}`)
  })) passed++; else failed++

  // Test 4: Protected endpoint with valid API key
  if (await test('Protected endpoint with valid API key', async () => {
    const { status, data } = await request('/api/test/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: JSON.stringify({ url: 'https://example.com' }),
    })
    if (status !== 202 && status !== 429) throw new Error(`Expected 202 or 429, got ${status}`)
    if (status === 202 && !data.testId) throw new Error('Missing testId in response')
  })) passed++; else failed++

  // Test 5: Session validation endpoint
  if (await test('Session validation endpoint', async () => {
    const { status, data } = await request('/api/auth/validate', {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    })
    if (status !== 200) throw new Error(`Expected 200, got ${status}`)
    if (!data.valid) throw new Error('Session should be valid')
  })) passed++; else failed++

  // Test 6: Login endpoint validation (missing fields)
  if (await test('Login endpoint - missing required fields', async () => {
    const { status } = await request('/api/auth/login', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: JSON.stringify({ url: 'https://example.com' }),
    })
    if (status !== 400) throw new Error(`Expected 400, got ${status}`)
  })) passed++; else failed++

  // Test 7: Login endpoint validation (invalid URL)
  if (await test('Login endpoint - invalid URL', async () => {
    const { status } = await request('/api/auth/login', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: JSON.stringify({
        url: 'not-a-url',
        username: 'test',
        password: 'test',
      }),
    })
    if (status !== 400) throw new Error(`Expected 400, got ${status}`)
  })) passed++; else failed++

  // Test 8: API key format validation
  if (await test('API key format validation (too short)', async () => {
    const { status } = await request('/api/test/start', {
      method: 'POST',
      headers: { Authorization: 'Bearer tester_short' },
      body: JSON.stringify({ url: 'https://example.com' }),
    })
    if (status !== 403) throw new Error(`Expected 403, got ${status}`)
  })) passed++; else failed++

  // Test 9: Legacy token support
  if (await test('Legacy token format support', async () => {
    // This test assumes the API_SECRET matches TEST_API_KEY
    const { status } = await request('/api/test/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: JSON.stringify({ url: 'https://example.com' }),
    })
    if (status !== 202 && status !== 429) throw new Error(`Expected 202 or 429, got ${status}`)
  })) passed++; else failed++

  // Test 10: Test status endpoint with auth
  if (await test('Test status endpoint with auth', async () => {
    const { status } = await request('/api/test/non-existent-id/status', {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    })
    if (status !== 404) throw new Error(`Expected 404, got ${status}`)
  })) passed++; else failed++

  // Summary
  log('\n=== Test Summary ===', 'cyan')
  log(`Total: ${passed + failed}`, 'cyan')
  log(`Passed: ${passed}`, 'green')
  log(`Failed: ${failed}`, failed > 0 ? 'red' : 'green')

  if (failed > 0) {
    log('\n⚠️  Some tests failed. Review errors above.', 'yellow')
    process.exit(1)
  } else {
    log('\n✓ All authentication tests passed!', 'green')
    process.exit(0)
  }
}

main().catch(err => {
  log(`\n✗ Fatal error: ${err.message}`, 'red')
  console.error(err)
  process.exit(1)
})
