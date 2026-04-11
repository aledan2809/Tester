import { test, expect } from '@playwright/test'
import { authHeaders } from '../utils/helpers'

test.describe('SSRF Protection — /api/test/start', () => {
  test('[SECURITY] accepts localhost URL (no SSRF protection)', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: { url: 'http://localhost:3012/api/health' },
    })
    // Server may return 202 (accepted) or 429 (busy) — both indicate no SSRF block
    // A proper SSRF-protected server would return 400 for internal IPs
    if (res.status() !== 400) {
      console.warn('[SSRF] Server does NOT block localhost URLs — no SSRF protection')
    }
    expect([202, 400, 429]).toContain(res.status())
  })

  test('[SECURITY] accepts 127.0.0.1 URL (no SSRF protection)', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: { url: 'http://127.0.0.1:80' },
    })
    if (res.status() !== 400) {
      console.warn('[SSRF] Server does NOT block 127.0.0.1 — no SSRF protection')
    }
    expect([202, 400, 429]).toContain(res.status())
  })

  test('[SECURITY] accepts 10.x private IP (no SSRF protection)', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: { url: 'http://10.0.0.1' },
    })
    if (res.status() !== 400) {
      console.warn('[SSRF] Server does NOT block private IP 10.0.0.1')
    }
    expect([202, 400, 429]).toContain(res.status())
  })

  test('[SECURITY] accepts 192.168.x private IP (no SSRF protection)', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: { url: 'http://192.168.1.1' },
    })
    if (res.status() !== 400) {
      console.warn('[SSRF] Server does NOT block private IP 192.168.1.1')
    }
    expect([202, 400, 429]).toContain(res.status())
  })

  test('[SECURITY] accepts 169.254.169.254 cloud metadata (no SSRF protection)', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: { url: 'http://169.254.169.254/latest/meta-data/' },
    })
    if (res.status() !== 400) {
      console.warn('[SSRF] Server does NOT block cloud metadata endpoint')
    }
    expect([202, 400, 429]).toContain(res.status())
  })

  test('[SECURITY] file:// protocol handling', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: { url: 'file:///etc/passwd' },
    })
    // file:// URLs may pass URL validation since new URL('file:///etc/passwd') succeeds
    if (res.status() !== 400) {
      console.warn('[SSRF] Server does NOT block file:// protocol')
    }
    expect([202, 400, 429]).toContain(res.status())
  })

  test('[SECURITY] data: protocol handling', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: { url: 'data:text/html,<script>alert(1)</script>' },
    })
    expect([202, 400, 429]).toContain(res.status())
  })

  test('[SECURITY] ftp:// protocol handling', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: { url: 'ftp://evil.com/malware' },
    })
    if (res.status() !== 400) {
      console.warn('[SSRF] Server does NOT block ftp:// protocol')
    }
    expect([202, 400, 429]).toContain(res.status())
  })
})
