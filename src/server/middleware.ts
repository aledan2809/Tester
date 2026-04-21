/**
 * Server Middleware — Auth + CORS + Request Logging
 */

import type { Request, Response, NextFunction } from 'express'

const API_SECRET = process.env.TESTER_API_SECRET || ''

/**
 * Bearer token authentication middleware.
 * Skips auth for /api/health endpoint.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Health check is public
  if (req.path === '/api/health') {
    next()
    return
  }

  // Skip auth if no secret configured (dev mode)
  if (!API_SECRET) {
    next()
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }

  const token = authHeader.slice(7)
  if (token !== API_SECRET) {
    res.status(403).json({ error: 'Invalid API secret' })
    return
  }

  next()
}

/**
 * Simple request logger.
 */
export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  const timestamp = new Date().toISOString().slice(11, 19)
  console.log(`[${timestamp}] ${req.method} ${req.path}`)
  next()
}

/**
 * Session payload for authenticated browser sessions used by journey audits
 * and multi-step scenarios. `cookies` is OPTIONAL — a session can be opened
 * without persisting cookies (e.g. for stateless smoke flows).
 */
export interface SessionPayload {
  url: string
  username: string
  platform?: string
  cookies?: string
}

/**
 * In-memory session store. Keeps created sessions addressable by token so
 * subsequent requests can look up context. Not durable — process restart
 * wipes it. Persistent storage belongs in a later phase.
 */
const sessions = new Map<string, SessionPayload & { createdAt: number }>()

/**
 * Create a session token for an authenticated browser session.
 * Returns a random token and stores the payload in the in-memory session map.
 */
export function createSession(payload: SessionPayload): string {
  const token = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
  sessions.set(token, { ...payload, createdAt: Date.now() })
  return token
}

/**
 * Look up a session by token. Returns null when missing or process was
 * restarted since session creation.
 */
export function getSession(token: string): (SessionPayload & { createdAt: number }) | null {
  return sessions.get(token) ?? null
}

/**
 * Drop a session from the store. Returns true if a session existed.
 * Useful for explicit logout or test teardown.
 */
export function revokeSession(token: string): boolean {
  return sessions.delete(token)
}

/**
 * Snapshot of live session count. Exposed for health checks / introspection.
 */
export function sessionCount(): number {
  return sessions.size
}
