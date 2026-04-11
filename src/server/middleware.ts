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
 * Session creation stub — returns an opaque session token.
 * Real session storage is handled in a later phase.
 */
export function createSession(_data: {
  url: string
  username: string
  platform?: string
  cookies?: string
}): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}
