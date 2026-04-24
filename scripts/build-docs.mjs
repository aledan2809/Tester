#!/usr/bin/env node
/**
 * T-D3 close — static docs site generator.
 *
 * Walks docs/*.md, converts each to HTML via `marked`, wraps in a
 * shared template with a sidebar navigation, and writes to
 * docs-build/. Designed to deploy to any static host:
 *   - GitHub Pages (push docs-build/ to gh-pages branch)
 *   - Vercel (set output dir to docs-build/)
 *   - VPS1 nginx (rsync docs-build/ → /var/www/tester-docs/)
 *
 * Run: `node scripts/build-docs.mjs`
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { marked } from 'marked'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'docs')
const OUT = path.join(ROOT, 'docs-build')

// Link rewrite: docs/cookbook.md → cookbook.html; *.md in-link → *.html
const LINK_RE = /\]\(([^)]+?)\.md(#[^)]*)?\)/g

function transformMarkdownLinks(md) {
  return md.replace(LINK_RE, '](./$1.html$2)')
}

function slug(name) {
  return name.replace(/\.md$/, '.html')
}

const PAGE_TPL = ({ title, nav, body }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title} — @aledan007/tester docs</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: #fafafa; color: #1a1a1a; }
  @media (prefers-color-scheme: dark) {
    body { background: #0b0b0b; color: #e5e5e5; }
    a { color: #7dd3fc; }
    code { background: #1f2937; color: #f9fafb; }
    pre code { background: transparent; }
    nav.sidebar { background: #111; border-right-color: #222; }
    nav.sidebar a { color: #e5e5e5; }
    nav.sidebar a.active { background: #1e293b; }
  }
  .layout { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
  nav.sidebar { background: #fff; border-right: 1px solid #eee; padding: 20px 16px; position: sticky; top: 0; height: 100vh; overflow-y: auto; box-sizing: border-box; }
  nav.sidebar h2 { font-size: 14px; margin: 0 0 12px 0; letter-spacing: 0.04em; text-transform: uppercase; color: #666; }
  nav.sidebar ul { list-style: none; padding: 0; margin: 0 0 16px 0; }
  nav.sidebar li { margin-bottom: 4px; }
  nav.sidebar a { display: block; padding: 6px 10px; border-radius: 4px; text-decoration: none; color: #333; font-size: 14px; }
  nav.sidebar a:hover { background: #f3f4f6; }
  nav.sidebar a.active { background: #e5e7eb; font-weight: 600; }
  main.content { max-width: 880px; margin: 0 auto; padding: 40px 48px; }
  main.content h1 { margin-top: 0; }
  main.content h2 { border-bottom: 1px solid #eee; padding-bottom: 4px; margin-top: 32px; }
  main.content pre { background: #f5f5f5; padding: 12px 16px; border-radius: 6px; overflow-x: auto; }
  main.content code { font-family: ui-monospace, Menlo, monospace; font-size: 13px; background: #f5f5f5; padding: 1px 6px; border-radius: 4px; }
  main.content pre code { padding: 0; border-radius: 0; }
  main.content table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  main.content th, main.content td { border-bottom: 1px solid #eee; padding: 8px; text-align: left; }
  main.content blockquote { border-left: 4px solid #d1d5db; padding-left: 12px; margin-left: 0; color: #6b7280; }
  footer { color: #6b7280; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px; margin-top: 40px; }
</style>
</head>
<body>
  <div class="layout">
    <nav class="sidebar">
      <h2>@aledan007/tester</h2>
      ${nav}
    </nav>
    <main class="content">
      ${body}
      <footer>
        Generated ${new Date().toISOString()} · <a href="./">index</a> ·
        <a href="https://github.com/aledan2809/Tester">GitHub</a>
      </footer>
    </main>
  </div>
</body>
</html>
`

function buildNav(pages, current) {
  const main = ['README', 'cookbook', 'anti-patterns', 'scenarios']
  const meta = ['API_CONTRACT']
  const mainLinks = main
    .filter((p) => pages.includes(`${p}.md`))
    .map(
      (p) =>
        `<li><a href="./${slug(p + '.md')}" class="${current === p + '.md' ? 'active' : ''}">${p === 'README' ? 'Overview' : p}</a></li>`,
    )
    .join('')
  const metaLinks = meta
    .filter((p) => pages.includes(`${p}.md`))
    .map(
      (p) =>
        `<li><a href="./${slug(p + '.md')}" class="${current === p + '.md' ? 'active' : ''}">${p}</a></li>`,
    )
    .join('')
  return `
    <h2>Guides</h2>
    <ul>${mainLinks || '<li><em>no pages</em></li>'}</ul>
    <h2>Reference</h2>
    <ul>${metaLinks || '<li><em>no pages</em></li>'}</ul>
  `
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`[build-docs] source dir missing: ${SRC}`)
    process.exit(1)
  }
  fs.mkdirSync(OUT, { recursive: true })
  const entries = fs.readdirSync(SRC).filter((f) => f.endsWith('.md'))
  if (entries.length === 0) {
    console.error(`[build-docs] no markdown files under ${SRC}`)
    process.exit(1)
  }
  let countOk = 0
  for (const file of entries) {
    const raw = fs.readFileSync(path.join(SRC, file), 'utf8')
    const transformed = transformMarkdownLinks(raw)
    const body = await marked.parse(transformed)
    const title = (raw.match(/^#\s+(.+)$/m) || [, file.replace(/\.md$/, '')])[1]
    const html = PAGE_TPL({
      title,
      nav: buildNav(entries, file),
      body,
    })
    const outFile = path.join(OUT, slug(file))
    fs.writeFileSync(outFile, html, 'utf8')
    countOk++
  }
  // Alias: index.html → README.html (if README exists)
  if (entries.includes('README.md')) {
    fs.copyFileSync(path.join(OUT, 'README.html'), path.join(OUT, 'index.html'))
  }
  console.log(`[build-docs] wrote ${countOk} page(s) → ${OUT}`)
}

main().catch((e) => {
  console.error('[build-docs] failed:', e)
  process.exit(1)
})
