/**
 * CLI Command: tester audit <url>
 * Deep E2E audit using Master's plugin system.
 *
 * This is a thin bridge — all audit logic lives in Master/mesh/qa/plugins/.
 * Tester imports it at runtime via dynamic import + findProject('Master').
 */

import fs from 'fs'
import path from 'path'
import { log, logSuccess, logWarn, logError, formatDuration, startSpinner, stopSpinner } from '../utils'

interface AuditOptions {
  project: string
  output: string
  plugins?: string       // comma-separated plugin ids to run (default: all)
  skipPlugins?: string   // comma-separated plugin ids to skip
  deep: boolean          // also run load-tester, email-tester (slow plugins)
  noAuth: boolean        // skip auth-resolver
  json: boolean          // output raw JSON instead of markdown
}

/**
 * Resolve the Master project path at runtime.
 * Uses the same approach as Master's paths.mjs: walk up from Tester to Projects root.
 */
function findMasterRoot(): string {
  // Tester is at <PROJECTS_ROOT>/Tester, Master at <PROJECTS_ROOT>/Master
  const testerRoot = path.resolve(__dirname, '..', '..', '..')
  const projectsRoot = path.dirname(testerRoot)

  const candidates = [
    path.join(projectsRoot, 'Master'),
    path.join(projectsRoot, 'master'),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'mesh', 'qa', 'plugins', 'registry.js'))) {
      return candidate
    }
  }

  // Fallback: try MASTER_ROOT env var
  const envRoot = process.env.MASTER_ROOT
  if (envRoot && fs.existsSync(path.join(envRoot, 'mesh', 'qa', 'plugins', 'registry.js'))) {
    return envRoot
  }

  throw new Error(
    'Master project not found. Expected at: ' + candidates[0] +
    '\nSet MASTER_ROOT env var if Master is at a different location.'
  )
}

export async function auditCommand(url: string, options: AuditOptions): Promise<void> {
  const normalizedUrl = url.startsWith('http') ? url : `https://${url}`
  const startTime = Date.now()

  log(`Starting deep audit for ${normalizedUrl}`)

  // 1. Locate Master's plugin system
  let masterRoot: string
  try {
    masterRoot = findMasterRoot()
    log(`Master found at: ${masterRoot}`)
  } catch (err: any) {
    logError(err.message)
    process.exit(1)
  }

  const pluginsPath = path.join(masterRoot, 'mesh', 'qa', 'plugins')

  // 2. Dynamic import Master's plugin system
  startSpinner('Loading plugin system...')
  let registry: any
  let credentialLoader: any

  try {
    registry = await import(path.join(pluginsPath, 'registry.js'))
    credentialLoader = await import(path.join(pluginsPath, 'credential-loader.js'))
    stopSpinner('Plugin system loaded')
  } catch (err: any) {
    stopSpinner()
    logError(`Failed to load Master plugin system: ${err.message}`)
    logWarn('Make sure Master project has mesh/qa/plugins/ with all dependencies installed.')
    process.exit(1)
  }

  // 3. Build context
  const projectName = options.project || deriveProjectName(normalizedUrl)
  const credentials = credentialLoader.loadCredentials(projectName)

  // Try to detect project path from Master's findProject
  let projectPath = process.cwd()
  try {
    const pathsMjs = path.join(masterRoot, 'paths.mjs')
    const paths = await import(pathsMjs)
    if (paths.findProject) {
      try {
        projectPath = paths.findProject(projectName)
      } catch { /* project not in registry, use cwd */ }
    }
  } catch { /* paths.mjs not available */ }

  // Read package.json if in a project dir
  let pkg: any = null
  const pkgPath = path.join(projectPath, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) } catch { /* */ }
  }

  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) }
  const stack = Object.keys(deps).filter(d =>
    ['next', 'react', 'express', 'fastapi', 'nestjs', 'prisma', 'stripe'].some(k => d.includes(k))
  )

  const ctx = registry.buildContext({
    projectPath,
    projectName,
    baseUrl: normalizedUrl,
    pkg,
    credentials,
    deps,
    stack,
    options: {
      skipPlugins: options.skipPlugins?.split(',').map((s: string) => s.trim()) || [],
      onlyPlugins: options.plugins?.split(',').map((s: string) => s.trim()) || [],
      deep: options.deep,
      noAuth: options.noAuth,
    },
  })

  // 4. Discover and filter plugins
  startSpinner('Discovering plugins...')
  let plugins = await registry.discoverPlugins()

  // Apply filters
  if (options.plugins) {
    const only = new Set(options.plugins.split(',').map((s: string) => s.trim()))
    plugins = plugins.filter((P: any) => only.has(P.id))
  }
  if (options.skipPlugins) {
    const skip = new Set(options.skipPlugins.split(',').map((s: string) => s.trim()))
    plugins = plugins.filter((P: any) => !skip.has(P.id))
  }
  if (options.noAuth) {
    plugins = plugins.filter((P: any) => P.id !== 'auth-resolver')
  }
  if (!options.deep) {
    // Skip slow plugins unless --deep
    const slowPlugins = new Set(['load-tester', 'email-tester'])
    plugins = plugins.filter((P: any) => !slowPlugins.has(P.id))
  }

  stopSpinner(`${plugins.length} plugins ready`)

  // 5. Run plugins
  log(`Running ${plugins.length} plugins against ${normalizedUrl}...`)
  log('')

  const results = await registry.runPlugins(plugins, ctx)
  const aggregate = registry.aggregateResults(results, plugins)

  // 6. Output
  const duration = Date.now() - startTime

  if (options.json) {
    // Raw JSON output
    const jsonOutput = {
      url: normalizedUrl,
      projectName,
      timestamp: new Date().toISOString(),
      durationMs: duration,
      ...aggregate,
      pluginResults: Object.fromEntries(results),
    }
    const outputPath = path.join(options.output, `audit_${projectName}_${Date.now()}.json`)
    fs.mkdirSync(options.output, { recursive: true })
    fs.writeFileSync(outputPath, JSON.stringify(jsonOutput, null, 2))
    logSuccess(`JSON report saved: ${outputPath}`)
  } else {
    // Markdown report
    const reportSection = registry.generateReportSection(aggregate)
    const report = `# Deep E2E Audit — ${projectName}\n\n` +
      `**URL:** ${normalizedUrl}\n` +
      `**Date:** ${new Date().toLocaleString()}\n` +
      `**Duration:** ${formatDuration(duration)}\n` +
      `**Plugins:** ${aggregate.activePlugins}/${aggregate.totalPlugins}\n\n` +
      `---\n\n` +
      reportSection

    const outputPath = path.join(options.output, `AUDIT_${projectName}_${new Date().toISOString().split('T')[0]}.md`)
    fs.mkdirSync(options.output, { recursive: true })
    fs.writeFileSync(outputPath, report)
    logSuccess(`Report saved: ${outputPath}`)
  }

  // 7. Summary
  log('')
  log(`${'─'.repeat(50)}`)
  log(`Overall Score: ${aggregate.overallScore}/100 ${aggregate.overallPassed ? '✅' : '❌'}`)
  log(`Plugins: ${aggregate.activePlugins} ran, ${aggregate.skippedPlugins} skipped`)
  log(`Issues: ${aggregate.criticalCount} critical, ${aggregate.highCount} high`)
  log(`Duration: ${formatDuration(duration)}`)
  log(`${'─'.repeat(50)}`)

  // Cross-suggestions
  const crossResult = results.get('cross-suggester')
  if (crossResult?.evidence?.suggestions?.length > 0) {
    log('')
    log('💡 Cross-App Suggestions:')
    for (const s of crossResult.evidence.suggestions) {
      log(`  → ${s.target}: ${s.reason}`)
    }
  }

  if (!aggregate.overallPassed) {
    process.exit(1)
  }
}

function deriveProjectName(url: string): string {
  try {
    const hostname = new URL(url).hostname
    return hostname
      .replace(/^www\./, '')
      .replace(/\.(com|io|app|net|org|ro|ae|vercel\.app)$/, '')
      .replace(/[^a-zA-Z0-9]/g, '-')
  } catch {
    return 'unknown'
  }
}
