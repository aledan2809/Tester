// lessons:skip-all
/**
 * T-008 — HTML diff report tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { writeHtmlReport } from '../../src/snapshot/html-report'
import { LocalFSStore } from '../../src/snapshot/store'
import { compareRoute } from '../../src/snapshot/compare'

function mkProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'html-rep-'))
}

async function solidPng(w: number, h: number, fill: [number, number, number, number]): Promise<Buffer> {
  const { PNG } = await import('pngjs')
  const png = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      png.data[idx] = fill[0]
      png.data[idx + 1] = fill[1]
      png.data[idx + 2] = fill[2]
      png.data[idx + 3] = fill[3]
    }
  }
  return PNG.sync.write(png)
}

describe('T-008 writeHtmlReport', () => {
  it('writes an HTML file containing PASS / FAIL / NO BASELINE rows with embedded images', async () => {
    const root = mkProject()
    try {
      const store = new LocalFSStore(root)
      const base = await solidPng(10, 10, [0, 0, 0, 255])
      const cur = await solidPng(10, 10, [255, 255, 255, 255])
      await store.put('demo', '/home', base)
      await store.put('demo', '/admin', base)

      const fail = await compareRoute(store, 'demo', '/home', cur, { returnDiffPng: true })
      const pass = await compareRoute(store, 'demo', '/admin', base, { returnDiffPng: true })
      const none = await compareRoute(store, 'demo', '/missing', cur)

      const outFile = path.join(root, 'report.html')
      await writeHtmlReport({
        project: 'demo',
        baselineStore: store,
        results: [fail, pass, none],
        outputPath: outFile,
      })
      const html = fs.readFileSync(outFile, 'utf8')
      expect(html).toMatch(/Visual diff — demo/)
      expect(html).toMatch(/<th>Route<\/th>/)
      expect(html).toMatch(/class="badge pass"/)
      expect(html).toMatch(/class="badge fail"/)
      expect(html).toMatch(/class="badge none"/)
      expect(html).toMatch(/data:image\/png;base64,/)
      // HTML-escapes user content
      expect(html).toMatch(/\/home/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('creates the output directory if missing', async () => {
    const root = mkProject()
    try {
      const store = new LocalFSStore(root)
      const out = path.join(root, 'nested', 'out', 'r.html')
      await writeHtmlReport({
        project: 'demo',
        baselineStore: store,
        results: [],
        outputPath: out,
      })
      expect(fs.existsSync(out)).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
