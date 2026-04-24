/**
 * T-010 — GitHub PR comment poster.
 *
 * Uses raw GitHub REST API (fetch) so Tester stays zero-hard-dep on
 * Octokit. Minimal surface: post a comment to a PR, or replace the
 * last comment authored by a given bot (for idempotent CI runs).
 *
 * Auth: GITHUB_TOKEN env var (required). Owner/repo/PR can come from
 * env (GITHUB_REPOSITORY, GITHUB_REF_NAME) for GitHub Actions or be
 * passed explicitly.
 */

export interface PostPrCommentInput {
  owner: string
  repo: string
  prNumber: number
  body: string
  /** Marker comment to detect + replace for idempotency. */
  marker?: string
  /** Auth token; defaults to process.env.GITHUB_TOKEN. */
  token?: string
  /** Override fetch for tests. */
  fetchImpl?: typeof fetch
}

export interface PrCommentResult {
  ok: boolean
  action: 'created' | 'updated' | 'error'
  status?: number
  commentId?: number
  error?: string
}

const API = 'https://api.github.com'

export async function postPrComment(input: PostPrCommentInput): Promise<PrCommentResult> {
  const token = input.token || process.env.GITHUB_TOKEN
  if (!token) {
    return { ok: false, action: 'error', error: 'GITHUB_TOKEN not set' }
  }
  const f = input.fetchImpl || fetch
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': '@aledan007/tester-perf',
  }

  // Idempotent path: if marker is set + an existing comment contains it, PATCH instead of POST.
  if (input.marker) {
    try {
      const listUrl = `${API}/repos/${input.owner}/${input.repo}/issues/${input.prNumber}/comments?per_page=100`
      const listRes = await f(listUrl, { headers })
      if (listRes.ok) {
        const comments = (await listRes.json()) as Array<{ id: number; body: string }>
        const prior = comments.find((c) => typeof c.body === 'string' && c.body.includes(input.marker!))
        if (prior) {
          const updUrl = `${API}/repos/${input.owner}/${input.repo}/issues/comments/${prior.id}`
          const updRes = await f(updUrl, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ body: input.body }),
          })
          if (updRes.ok) {
            return { ok: true, action: 'updated', status: updRes.status, commentId: prior.id }
          }
          return {
            ok: false,
            action: 'error',
            status: updRes.status,
            error: `PATCH failed: ${await updRes.text().catch(() => '')}`,
          }
        }
      }
    } catch (e) {
      // fall through to POST
      process.stderr.write(`[perf-github] list comments failed: ${(e as Error).message}\n`)
    }
  }

  const postUrl = `${API}/repos/${input.owner}/${input.repo}/issues/${input.prNumber}/comments`
  const postRes = await f(postUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ body: input.body }),
  })
  if (postRes.ok) {
    const created = (await postRes.json()) as { id?: number }
    return { ok: true, action: 'created', status: postRes.status, commentId: created.id }
  }
  return {
    ok: false,
    action: 'error',
    status: postRes.status,
    error: `POST failed: ${await postRes.text().catch(() => '')}`,
  }
}

/**
 * Parse GitHub Actions env (GITHUB_REPOSITORY, GITHUB_REF_NAME, GITHUB_EVENT_PATH)
 * to derive owner/repo/pr for `postPrComment`. Returns null if not in a PR
 * context (push to branch, workflow_dispatch, etc.).
 */
export function parseGithubActionsContext(): { owner: string; repo: string; prNumber: number } | null {
  const repoSlug = process.env.GITHUB_REPOSITORY
  if (!repoSlug || !repoSlug.includes('/')) return null
  const [owner, repo] = repoSlug.split('/')
  // GITHUB_EVENT_PATH points at a JSON payload; PR # is at event.pull_request.number.
  const eventPath = process.env.GITHUB_EVENT_PATH
  if (eventPath) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('node:fs') as typeof import('node:fs')
      const raw = fs.readFileSync(eventPath, 'utf8')
      const evt = JSON.parse(raw) as { pull_request?: { number?: number }; number?: number }
      const num = evt.pull_request?.number ?? evt.number
      if (typeof num === 'number') return { owner, repo, prNumber: num }
    } catch {
      // ignore
    }
  }
  return null
}
