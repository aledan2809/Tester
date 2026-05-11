/**
 * Audit-Suite Module C — Scenario session.
 *
 * Manages a Bearer token and a simple cookie jar for use across HTTP calls
 * inside a scenario. ScenarioSession.fetch() wraps globalThis.fetch,
 * automatically injecting Authorization and Cookie headers.
 */

export class ScenarioSession {
  private token: string | null = null
  private readonly cookies: Map<string, string> = new Map()

  setToken(token: string): void {
    this.token = token
  }

  getToken(): string | null {
    return this.token
  }

  setCookie(name: string, value: string): void {
    this.cookies.set(name, value)
  }

  /** Build the Cookie header string from the jar. */
  getCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
  }

  /** Fetch with injected Authorization + Cookie headers. */
  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers as HeadersInit | undefined)
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`)
    const cookieStr = this.getCookieHeader()
    if (cookieStr) headers.set('Cookie', cookieStr)
    return globalThis.fetch(url, { ...init, headers })
  }

  /**
   * POST to a login endpoint and extract the Bearer token from the response.
   * By default reads `json.token` or `json.accessToken`.
   * Throws on non-2xx status.
   */
  async login(
    url: string,
    body: Record<string, unknown>,
    extractToken?: (data: unknown) => string,
  ): Promise<void> {
    const res = await globalThis.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Login failed: ${res.status} ${res.statusText}`)
    const data = (await res.json()) as Record<string, unknown>
    const tok = extractToken
      ? extractToken(data)
      : ((data.token as string) ?? (data.accessToken as string))
    if (tok) this.setToken(tok)
  }
}
