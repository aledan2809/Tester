/**
 * T-008 — Visual regression baseline storage.
 *
 * `BaselineStore` abstracts the persistence layer for baseline PNGs so
 * CLI (local FS) + server mode (S3/MinIO, follow-up commit) can share the
 * same compare/approve flow. This MVP ships a LocalFSStore; S3 adapter is
 * stubbed with a clear throw so consumers fail fast if they try to use
 * it before the cloud adapter lands.
 *
 * Baseline layout (local):
 *   <baseDir>/<project>/<safeRoute>.png
 *   <baseDir>/<project>/<safeRoute>.meta.json   (capturedAt, viewport, hash)
 *
 * Routes are sanitized to a filesystem-safe slug: replace `/` with `__`,
 * strip query strings, truncate to 120 chars. Hash appended when the
 * raw slug would be ambiguous (two different URLs collapse to same slug).
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'

export interface BaselineMeta {
  capturedAt: string
  route: string
  viewport?: { width: number; height: number }
  /** sha256 of the PNG bytes for quick existence/dedup checks. */
  hash: string
}

export interface BaselineStore {
  /** Write the baseline for a route; overwrites if it exists. */
  put(project: string, route: string, png: Buffer, viewport?: { width: number; height: number }): Promise<BaselineMeta>
  /** Read the baseline bytes; null when absent. */
  get(project: string, route: string): Promise<Buffer | null>
  /** List every baseline route recorded for this project. */
  list(project: string): Promise<string[]>
  /** Remove the baseline for a route (e.g. --approve cleanup). */
  remove(project: string, route: string): Promise<boolean>
  /** Resolve the filesystem-like path (for human reports); may be a URI. */
  pathFor(project: string, route: string): string
}

export function sanitizeRoute(route: string): string {
  const noQuery = route.split('?')[0]
  const noProto = noQuery.replace(/^https?:\/\//i, '')
  const slug = noProto.replace(/[^A-Za-z0-9/_-]/g, '_').replace(/\/+/g, '__')
  const trimmed = slug.replace(/^__+|__+$/g, '') || 'root'
  if (trimmed.length <= 120) return trimmed
  const hash = crypto.createHash('sha256').update(route).digest('hex').slice(0, 8)
  return `${trimmed.slice(0, 110)}__${hash}`
}

export class LocalFSStore implements BaselineStore {
  constructor(public readonly baseDir: string) {}

  private projectDir(project: string): string {
    return path.join(this.baseDir, project)
  }

  pathFor(project: string, route: string): string {
    return path.join(this.projectDir(project), `${sanitizeRoute(route)}.png`)
  }

  private metaPathFor(project: string, route: string): string {
    return path.join(this.projectDir(project), `${sanitizeRoute(route)}.meta.json`)
  }

  async put(
    project: string,
    route: string,
    png: Buffer,
    viewport?: { width: number; height: number },
  ): Promise<BaselineMeta> {
    const dir = this.projectDir(project)
    fs.mkdirSync(dir, { recursive: true })
    const file = this.pathFor(project, route)
    fs.writeFileSync(file, png)
    const hash = crypto.createHash('sha256').update(png).digest('hex')
    const meta: BaselineMeta = {
      capturedAt: new Date().toISOString(),
      route,
      viewport,
      hash,
    }
    fs.writeFileSync(this.metaPathFor(project, route), JSON.stringify(meta, null, 2), 'utf8')
    return meta
  }

  async get(project: string, route: string): Promise<Buffer | null> {
    const file = this.pathFor(project, route)
    if (!fs.existsSync(file)) return null
    return fs.readFileSync(file)
  }

  async list(project: string): Promise<string[]> {
    const dir = this.projectDir(project)
    if (!fs.existsSync(dir)) return []
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.meta.json'))
    const routes: string[] = []
    for (const f of files) {
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as BaselineMeta
        if (parsed.route) routes.push(parsed.route)
      } catch {
        // Corrupt meta — skip silently; next capture rebuilds it.
      }
    }
    return routes
  }

  async remove(project: string, route: string): Promise<boolean> {
    const png = this.pathFor(project, route)
    const meta = this.metaPathFor(project, route)
    let removed = false
    if (fs.existsSync(png)) {
      fs.unlinkSync(png)
      removed = true
    }
    if (fs.existsSync(meta)) fs.unlinkSync(meta)
    return removed
  }
}

/**
 * S3 adapter stub. Throws on any call so server-mode consumers fail fast
 * until the follow-up cloud commit lands (T-008 follow-up: S3/MinIO).
 */
export interface S3StoreClient {
  putObject: (params: {
    Key: string
    Body: Buffer
    ContentType?: string
    Metadata?: Record<string, string>
  }) => Promise<void>
  getObject: (params: { Key: string }) => Promise<{ Body: Buffer | Uint8Array } | null>
  listObjects: (params: { Prefix: string }) => Promise<{ Keys: string[] }>
  deleteObject: (params: { Key: string }) => Promise<void>
}

export class S3Store implements BaselineStore {
  constructor(
    public readonly client: S3StoreClient,
    public readonly bucket: string,
    public readonly prefix: string = 'baselines',
  ) {}

  private key(project: string, route: string, ext: string): string {
    return `${this.prefix}/${project}/${sanitizeRoute(route)}${ext}`
  }

  pathFor(project: string, route: string): string {
    return `s3://${this.bucket}/${this.key(project, route, '.png')}`
  }

  async put(
    project: string,
    route: string,
    png: Buffer,
    viewport?: { width: number; height: number },
  ): Promise<BaselineMeta> {
    const hash = crypto.createHash('sha256').update(png).digest('hex')
    const meta: BaselineMeta = {
      capturedAt: new Date().toISOString(),
      route,
      viewport,
      hash,
    }
    await this.client.putObject({
      Key: this.key(project, route, '.png'),
      Body: png,
      ContentType: 'image/png',
      Metadata: {
        route,
        captured_at: meta.capturedAt,
        hash,
        ...(viewport
          ? { viewport_w: String(viewport.width), viewport_h: String(viewport.height) }
          : {}),
      },
    })
    await this.client.putObject({
      Key: this.key(project, route, '.meta.json'),
      Body: Buffer.from(JSON.stringify(meta, null, 2), 'utf8'),
      ContentType: 'application/json',
    })
    return meta
  }

  async get(project: string, route: string): Promise<Buffer | null> {
    const res = await this.client.getObject({ Key: this.key(project, route, '.png') })
    if (!res) return null
    return Buffer.isBuffer(res.Body) ? res.Body : Buffer.from(res.Body)
  }

  async list(project: string): Promise<string[]> {
    const { Keys } = await this.client.listObjects({
      Prefix: `${this.prefix}/${project}/`,
    })
    const routes: string[] = []
    for (const k of Keys) {
      if (!k.endsWith('.meta.json')) continue
      try {
        const res = await this.client.getObject({ Key: k })
        if (!res) continue
        const buf = Buffer.isBuffer(res.Body) ? res.Body : Buffer.from(res.Body)
        const parsed = JSON.parse(buf.toString('utf8')) as BaselineMeta
        if (parsed.route) routes.push(parsed.route)
      } catch {
        // corrupt meta entry; skip
      }
    }
    return routes
  }

  async remove(project: string, route: string): Promise<boolean> {
    let removed = false
    try {
      await this.client.deleteObject({ Key: this.key(project, route, '.png') })
      removed = true
    } catch {
      // Idempotent: missing-key deletes are not failures.
    }
    try {
      await this.client.deleteObject({ Key: this.key(project, route, '.meta.json') })
    } catch {
      // same
    }
    return removed
  }
}

export interface AwsSdkLikeS3 {
  send: (
    command: unknown,
  ) => Promise<{ Body?: unknown; Contents?: Array<{ Key?: string }> }>
}
export interface AwsSdkLikeCommandCtors {
  PutObjectCommand: new (input: unknown) => unknown
  GetObjectCommand: new (input: unknown) => unknown
  ListObjectsV2Command: new (input: unknown) => unknown
  DeleteObjectCommand: new (input: unknown) => unknown
}

/**
 * Wrap a `@aws-sdk/client-s3`-shaped S3 client into `S3StoreClient`.
 * Tester has zero hard AWS dep; consumers supply the SDK + constructors.
 */
export function asS3StoreClient(
  sdk: AwsSdkLikeS3,
  ctors: AwsSdkLikeCommandCtors,
  bucket: string,
): S3StoreClient {
  return {
    putObject: async ({ Key, Body, ContentType, Metadata }) => {
      await sdk.send(
        new ctors.PutObjectCommand({ Bucket: bucket, Key, Body, ContentType, Metadata }),
      )
    },
    getObject: async ({ Key }) => {
      try {
        const res = await sdk.send(new ctors.GetObjectCommand({ Bucket: bucket, Key }))
        if (!res || res.Body === undefined) return null
        const body = res.Body as { transformToByteArray?: () => Promise<Uint8Array> }
        if (typeof body.transformToByteArray === 'function') {
          return { Body: await body.transformToByteArray() }
        }
        return { Body: Buffer.from(res.Body as Uint8Array) }
      } catch (e) {
        const code =
          (e as { name?: string; Code?: string }).name ||
          (e as { Code?: string }).Code
        if (code === 'NoSuchKey' || code === 'NotFound') return null
        throw e
      }
    },
    listObjects: async ({ Prefix }) => {
      const res = await sdk.send(new ctors.ListObjectsV2Command({ Bucket: bucket, Prefix }))
      const keys = (res.Contents || []).map((c) => c.Key || '').filter(Boolean)
      return { Keys: keys }
    },
    deleteObject: async ({ Key }) => {
      await sdk.send(new ctors.DeleteObjectCommand({ Bucket: bucket, Key }))
    },
  }
}

/** Default local baseline dir — `<cwd>/.tester/baselines`. */
export function defaultBaselineDir(): string {
  return path.join(process.cwd(), '.tester', 'baselines')
}
