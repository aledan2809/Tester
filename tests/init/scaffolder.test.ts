// lessons:skip-all
/**
 * T-A1 — `tester init` scaffolder regression tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import {
  initFeature,
  assertFeatureSlug,
  renderCoverageYaml,
  renderSpecFile,
  renderReadme,
  loadFeaturesIndex,
  upsertFeaturesIndex,
} from '../../src/init/scaffolder'

function mkProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'init-'))
}

describe('T-A1 assertFeatureSlug', () => {
  it('accepts valid slugs', () => {
    expect(() => assertFeatureSlug('four-way-match')).not.toThrow()
    expect(() => assertFeatureSlug('users')).not.toThrow()
    expect(() => assertFeatureSlug('a1-b2-c3')).not.toThrow()
  })

  it('rejects invalid slugs', () => {
    expect(() => assertFeatureSlug('Invalid')).toThrow(/invalid/)
    expect(() => assertFeatureSlug('with space')).toThrow()
    expect(() => assertFeatureSlug('-lead-hyphen')).toThrow()
    expect(() => assertFeatureSlug('')).toThrow()
    expect(() => assertFeatureSlug('a'.repeat(70))).toThrow()
  })
})

describe('T-A1 renderCoverageYaml', () => {
  it('produces parseable YAML with required T-002 keys', () => {
    const raw = renderCoverageYaml('demo', 'procuchaingo2')
    const parsed = yaml.load(raw) as {
      feature: string
      owner: string
      scenarios: Array<{ id: string; status: string; severity: string }>
    }
    expect(parsed.feature).toBe('demo')
    expect(parsed.owner).toBe('procuchaingo2')
    expect(parsed.scenarios.length).toBeGreaterThanOrEqual(3)
    for (const s of parsed.scenarios) {
      expect(s.id).toMatch(/^A\d+$/)
      expect(s.status).toBe('missing')
      expect(['critical', 'high', 'medium', 'low', 'info']).toContain(s.severity)
    }
  })
})

describe('T-A1 renderSpecFile', () => {
  it('includes selfcheck import + beforeAll + afterAll teardown', () => {
    const src = renderSpecFile('demo', true)
    expect(src).toMatch(/from '@aledan007\/tester\/self-test'/)
    expect(src).toMatch(/runSelfCheck\(\)/)
    expect(src).toMatch(/beforeAll\(/)
    expect(src).toMatch(/afterAll\(/)
    expect(src).toMatch(/createdIds\.splice/)
  })

  it('includes login helper when withLogin=true', () => {
    const src = renderSpecFile('demo', true)
    expect(src).toMatch(/async function login\(/)
    expect(src).toMatch(/TEST_EMAIL/)
  })

  it('omits login helper when withLogin=false', () => {
    const src = renderSpecFile('demo', false)
    expect(src).not.toMatch(/async function login\(/)
  })

  it('emits skip-by-default scenarios (A1/A2/A3)', () => {
    const src = renderSpecFile('demo', false)
    expect(src).toMatch(/it\.skip\('A1:/)
    expect(src).toMatch(/it\.skip\('A2:/)
    expect(src).toMatch(/it\.skip\('A3:/)
  })
})

describe('T-A1 renderReadme', () => {
  it('references feature + owner + generator command', () => {
    const md = renderReadme('demo', 'procuchaingo2')
    expect(md).toMatch(/# demo —/)
    expect(md).toMatch(/Owner:\*\* procuchaingo2/)
    expect(md).toMatch(/tester init demo/)
    expect(md).toMatch(/npx vitest run tests\/demo/)
  })
})

describe('T-A1 featuresIndex — load + upsert', () => {
  it('creates an empty index when file missing, then upserts one entry', () => {
    const root = mkProject()
    try {
      expect(loadFeaturesIndex(root).features).toEqual([])
      const file = upsertFeaturesIndex(root, {
        feature: 'demo',
        owner: 'tester',
        coverage_file: 'coverage/demo.yaml',
        spec_file: 'tests/demo/index.spec.ts',
        added_at: '2026-04-24T00:00:00Z',
      })
      expect(fs.existsSync(file)).toBe(true)
      const reloaded = loadFeaturesIndex(root)
      expect(reloaded.features).toHaveLength(1)
      expect(reloaded.features[0].feature).toBe('demo')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('upsert replaces existing entry for same feature (no duplicates)', () => {
    const root = mkProject()
    try {
      upsertFeaturesIndex(root, {
        feature: 'demo',
        owner: 'a',
        coverage_file: 'c1',
        spec_file: 's1',
        added_at: '2026-04-20T00:00:00Z',
      })
      upsertFeaturesIndex(root, {
        feature: 'demo',
        owner: 'b',
        coverage_file: 'c2',
        spec_file: 's2',
        added_at: '2026-04-24T00:00:00Z',
      })
      const idx = loadFeaturesIndex(root)
      expect(idx.features).toHaveLength(1)
      expect(idx.features[0].owner).toBe('b')
      expect(idx.features[0].coverage_file).toBe('c2')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('sorts index alphabetically for deterministic diffs', () => {
    const root = mkProject()
    try {
      upsertFeaturesIndex(root, {
        feature: 'zeta',
        owner: 'a',
        coverage_file: 'c',
        spec_file: 's',
        added_at: '2026-04-24T00:00:00Z',
      })
      upsertFeaturesIndex(root, {
        feature: 'alpha',
        owner: 'a',
        coverage_file: 'c',
        spec_file: 's',
        added_at: '2026-04-24T00:00:00Z',
      })
      const idx = loadFeaturesIndex(root)
      expect(idx.features.map((f) => f.feature)).toEqual(['alpha', 'zeta'])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('survives corrupt YAML → returns empty index', () => {
    const root = mkProject()
    try {
      const dir = path.join(root, 'coverage')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'features.yaml'), ':::not yaml:::', 'utf8')
      expect(loadFeaturesIndex(root).features).toEqual([])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('T-A1 initFeature — end-to-end scaffold', () => {
  it('creates coverage yaml + spec + README + index entry', () => {
    const root = mkProject()
    try {
      const result = initFeature({ feature: 'demo', projectRoot: root, owner: 'tester' })
      expect(result.filesWritten.length).toBe(3)
      expect(result.filesSkipped).toEqual([])

      const coverageFile = path.join(root, 'coverage', 'demo.yaml')
      expect(fs.existsSync(coverageFile)).toBe(true)
      const specFile = path.join(root, 'tests', 'demo', 'index.spec.ts')
      expect(fs.existsSync(specFile)).toBe(true)
      const readme = path.join(root, 'tests', 'demo', 'README.md')
      expect(fs.existsSync(readme)).toBe(true)

      // features.yaml gained a sorted entry
      const idx = loadFeaturesIndex(root)
      expect(idx.features.some((f) => f.feature === 'demo')).toBe(true)

      // spec compiles at the syntax level — load + re-parse wiht a quick TS-ish check
      const spec = fs.readFileSync(specFile, 'utf8')
      expect(spec).toMatch(/runSelfCheck/)
      expect(spec).toMatch(/describe\('demo —/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('skips re-write when files already exist without --overwrite', () => {
    const root = mkProject()
    try {
      initFeature({ feature: 'demo', projectRoot: root })
      const second = initFeature({ feature: 'demo', projectRoot: root })
      expect(second.filesWritten).toEqual([])
      expect(second.filesSkipped.length).toBe(3)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('overwrites when --overwrite is set', () => {
    const root = mkProject()
    try {
      initFeature({ feature: 'demo', projectRoot: root })
      const second = initFeature({ feature: 'demo', projectRoot: root, overwrite: true })
      expect(second.filesWritten.length).toBe(3)
      expect(second.filesSkipped).toEqual([])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('throws when project root does not exist', () => {
    expect(() =>
      initFeature({ feature: 'demo', projectRoot: '/tmp/__never_exists_xyz_init__' }),
    ).toThrow(/project root/)
  })

  it('rejects invalid feature slug', () => {
    const root = mkProject()
    try {
      expect(() => initFeature({ feature: 'Invalid Slug', projectRoot: root })).toThrow()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
