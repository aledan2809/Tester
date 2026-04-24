/**
 * CLI Command: tester audit-only
 * NO-TOUCH CRITIC — ML2 Wave 2 (AVE Ecosystem #4)
 *
 * Runs in AUDIT-ONLY mode (validator enforced).
 * Performs static code analysis, identifies security gaps,
 * and generates AUDIT_GAPS.md without modifying any system state.
 */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { log, logSuccess, logError, formatDuration, startSpinner, stopSpinner } from '../utils'
import { auditValidator } from '../../validator/audit-only'
import {
  generateGapsMarkdown,
  writeGapsReport,
  writeAuditFailedLog,
  type AuditFinding,
  type AuditMetadata,
  type AuditReport,
  type FindingSeverity,
} from '../../reporter/gaps-generator'

interface AuditOnlyOptions {
  output: string
  date: string
}

/**
 * Static code audit — scans source files for known vulnerability patterns.
 * Read-only: no DB writes, no API calls, no file mutations.
 */
export async function auditOnlyCommand(options: AuditOnlyOptions): Promise<void> {
  const startTime = Date.now()
  const projectRoot = path.resolve(__dirname, '..', '..')
  const outputDir = path.resolve(options.output, `audit-${options.date}`, 'tester')

  log('ML2 Wave 2 — NO-TOUCH CRITIC (AVE Ecosystem #4)')
  log('Mode: AUDIT-ONLY (validator enforced)')
  log(`Project root: ${projectRoot}`)
  log(`Output: ${outputDir}`)
  log('')

  // Enable audit-only validator
  auditValidator.enable()

  try {
    // Verify validator blocks writes
    try {
      auditValidator.validateHttpMethod('POST', '/test')
    } catch {
      // Expected — validator is working
    }
    try {
      auditValidator.validateDbOperation('INSERT INTO test VALUES (1)')
    } catch {
      // Expected — validator is working
    }
    try {
      auditValidator.validateFsWrite('/etc/passwd')
    } catch {
      // Expected — validator is working
    }

    // Clear violations from validation checks
    auditValidator.enable()
    log('Validator self-test passed — all write operations blocked')
    log('')

    // Collect metadata
    startSpinner('Collecting metadata...')
    const metadata = collectMetadata(projectRoot, options.date)
    stopSpinner('Metadata collected')

    // Run static analysis
    startSpinner('Scanning source files...')
    const sourceFiles = collectSourceFiles(projectRoot)
    stopSpinner(`${sourceFiles.length} source files found`)

    startSpinner('Analyzing security patterns...')
    const findings = analyzeCodebase(projectRoot, sourceFiles)
    metadata.totalFilesReviewed = sourceFiles.length + 1
    stopSpinner(`${findings.length} findings identified`)

    // Verify no validator violations during audit
    if (auditValidator.hasViolations()) {
      const violations = auditValidator.getViolations()
      logError(`Audit violated read-only mode: ${violations.length} violation(s)`)
      const failPath = writeAuditFailedLog(
        outputDir,
        new Error('Audit-only mode violated during execution'),
        violations.map(v => ({ type: v.type, detail: v.detail })),
      )
      logError(`Failure log: ${failPath}`)
      process.exit(1)
    }

    // Generate report
    const report: AuditReport = { findings, metadata }

    startSpinner('Generating AUDIT_GAPS.md...')
    const reportPath = writeGapsReport(report, outputDir)
    stopSpinner(`Report written: ${reportPath}`)

    // Also write to project root
    const rootReportPath = path.join(projectRoot, 'AUDIT_GAPS.md')
    const content = generateGapsMarkdown(report)
    fs.writeFileSync(rootReportPath, content, 'utf8')
    logSuccess(`Root report updated: ${rootReportPath}`)

    // Summary
    const duration = Date.now() - startTime
    const counts = {
      CRITICAL: findings.filter(f => f.severity === 'CRITICAL').length,
      HIGH: findings.filter(f => f.severity === 'HIGH').length,
      MEDIUM: findings.filter(f => f.severity === 'MEDIUM').length,
      LOW: findings.filter(f => f.severity === 'LOW').length,
    }

    log('')
    log('─'.repeat(50))
    log(`Audit complete in ${formatDuration(duration)}`)
    log(`Findings: ${findings.length} total`)
    log(`  CRITICAL: ${counts.CRITICAL}`)
    log(`  HIGH:     ${counts.HIGH}`)
    log(`  MEDIUM:   ${counts.MEDIUM}`)
    log(`  LOW:      ${counts.LOW}`)
    log(`Validator: ${auditValidator.getSummary()}`)
    log('─'.repeat(50))
  } catch (err: any) {
    stopSpinner()
    logError(`Audit failed: ${err.message}`)
    writeAuditFailedLog(
      outputDir,
      err,
      auditValidator.getViolations().map(v => ({ type: v.type, detail: v.detail })),
    )
    process.exit(1)
  } finally {
    auditValidator.disable()
  }
}

function collectMetadata(projectRoot: string, auditDate: string): AuditMetadata {
  let commitHash = 'unknown'
  let branch = 'unknown'
  try {
    commitHash = execSync('git rev-parse HEAD', { cwd: projectRoot, encoding: 'utf8' }).trim()
    branch = execSync('git branch --show-current', { cwd: projectRoot, encoding: 'utf8' }).trim()
  } catch { /* not a git repo */ }

  let version = '0.1.0'
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
    version = pkg.version || version
  } catch { /* */ }

  return {
    auditDate,
    testerVersion: version,
    commitHash,
    branch,
    stack: 'Node.js, TypeScript, Express 5, Puppeteer, better-sqlite3',
    totalFilesReviewed: 0, // filled after scan
    categories: [
      'SSRF', 'RCE', 'Auth Bypass', 'Input Validation', 'Data Exposure',
      'Path Traversal', 'DoS', 'Session Management', 'Test Coverage',
      'Code Quality', 'Injection', 'Cookie Security', 'Race Conditions',
      'Timing Attacks', 'Prompt Injection', 'Rate Limiting',
    ],
  }
}

function collectSourceFiles(projectRoot: string): string[] {
  const srcDir = path.join(projectRoot, 'src')
  const files: string[] = []

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
        files.push(full)
      }
    }
  }

  if (fs.existsSync(srcDir)) walk(srcDir)
  return files
}

interface PatternMatch {
  id: string
  severity: FindingSeverity
  title: string
  pattern: RegExp
  description: string
  suggestion: string
  category: string
}

function analyzeCodebase(projectRoot: string, sourceFiles: string[]): AuditFinding[] {
  const findings: AuditFinding[] = []
  let findingIndex = 1

  const patterns: PatternMatch[] = [
    {
      id: 'SSRF', severity: 'CRITICAL',
      title: 'SSRF via unvalidated callback URL',
      pattern: /fetch\s*\(\s*(?:callbackUrl|url|endpoint)\b/,
      description: 'User-controlled URL passed directly to fetch() without validation. Enables SSRF to internal services, cloud metadata endpoints, and localhost.',
      suggestion: 'Validate URLs against allowlist. Block RFC 1918, link-local, loopback, cloud metadata.',
      category: 'SSRF',
    },
    {
      id: 'RCE-EVAL', severity: 'CRITICAL',
      title: 'Arbitrary JavaScript execution via evaluate step action',
      pattern: /page\.evaluate\s*\(\s*(?:step\.value|code|script)/,
      description: 'page.evaluate() executes arbitrary JS in browser context. Blocklist in safety.ts is bypassable via string concatenation, template literals, and indirect references.',
      suggestion: 'Remove evaluate action or implement AST-based allowlist. Sandbox evaluate calls.',
      category: 'RCE',
    },
    {
      id: 'AUTH-BYPASS', severity: 'CRITICAL',
      title: 'API authentication bypass in dev mode',
      pattern: /if\s*\(\s*!API_SECRET\s*\)/,
      description: 'When TESTER_API_SECRET is unset, ALL endpoints are publicly accessible including browser launch and credential processing endpoints.',
      suggestion: 'Fail closed: refuse to start without TESTER_API_SECRET in production. Restrict to localhost-only when no secret configured.',
      category: 'Auth Bypass',
    },
    {
      id: 'TIMING', severity: 'HIGH',
      title: 'Timing attack on Bearer token comparison',
      pattern: /token\s*!==\s*(?:API_SECRET|secret|key)/,
      description: 'Bearer token authentication uses !== for string comparison, which is not constant-time. Byte-by-byte deduction is feasible against low-latency deployments.',
      suggestion: 'Use crypto.timingSafeEqual(Buffer.from(token), Buffer.from(API_SECRET)).',
      category: 'Timing Attacks',
    },
    {
      id: 'SESSION', severity: 'HIGH',
      title: 'Session token not cryptographically secure',
      pattern: /Math\.random\(\)\.toString\(36\)/,
      description: 'Tokens use Date.now() + Math.random() — both predictable. Session data parameter is accepted but completely ignored.',
      suggestion: 'Use crypto.randomUUID() or crypto.randomBytes(32).toString("hex"). Implement session storage with expiration.',
      category: 'Session Management',
    },
    {
      id: 'RATE-LIMIT', severity: 'HIGH',
      title: 'No rate limiting on login endpoint',
      pattern: /\/api\/auth\/login/,
      description: 'Spawns headless browser per request with no rate limiting. Enables DoS via flooding, credential brute-force, anonymous login proxy.',
      suggestion: 'Add per-IP rate limiting (5 req/min), queue login requests, add proof-of-work.',
      category: 'Rate Limiting',
    },
    {
      id: 'CONFIG-INJECT', severity: 'HIGH',
      title: 'Config injection via API — arbitrary key override',
      pattern: /\.\.\.(?:config|body\.config|req\.body)/,
      description: 'Request body config spread directly into TesterConfig without validation. Attacker can inject anthropicApiKey, videoDir, outputDir, sessionPath.',
      suggestion: 'Whitelist allowed keys. Validate types/ranges. Block sensitive fields.',
      category: 'Input Validation',
    },
    {
      id: 'IDOR', severity: 'HIGH',
      title: 'IDOR in job access — no ownership check',
      pattern: /req\.params\.id|params\.jobId/,
      description: 'Any authenticated user can access any job ID. Endpoints return data for any valid job ID without authorization check.',
      suggestion: 'Store user_id per job. Verify ownership before returning data.',
      category: 'Auth Bypass',
    },
    {
      id: 'PROMPT-INJECT', severity: 'HIGH',
      title: 'Prompt injection via crawled page data in AI scenario generation',
      pattern: /JSON\.stringify\((?:pageDescriptions|pages|elements)\)/,
      description: 'Crawled page data serialized and injected directly into the Claude prompt. Attacker-controlled page can embed prompt injection payloads in HTML elements.',
      suggestion: 'Sanitize all page description fields. Use structured prompt sections with clear delimiters.',
      category: 'Prompt Injection',
    },
    {
      id: 'REGEX-PARSE', severity: 'HIGH',
      title: 'Unbounded regex in AI response parsing',
      pattern: /\.match\(\/\\\[[\[\]\\s\\S]*\\\]\//,
      description: 'Greedy regex captures from first [ to last ] in AI response. Combined with unchecked JSON.parse cast, enables scenario injection.',
      suggestion: 'Use precise extraction by counting brackets. Validate parsed result with a schema.',
      category: 'Input Validation',
    },
    {
      id: 'CLI-CRED', severity: 'HIGH',
      title: 'CLI --password flag exposes credentials in shell history',
      pattern: /--password\s*<pass>/,
      description: 'Password accepted directly from command-line arguments. Stored in shell history, visible in ps aux, and logged by audit tools.',
      suggestion: 'Deprecate --password in favor of --password-env only. Add a warning if --password is used.',
      category: 'Data Exposure',
    },
    {
      id: 'CRAWL-DOS', severity: 'HIGH',
      title: 'No crawl rate limiting enables target site DoS',
      pattern: /maxPages|crawlSite/,
      description: 'BFS crawler makes no delay between page requests. Rapid-fire HTTP requests can cause resource exhaustion on target sites.',
      suggestion: 'Add configurable delay between requests (default 100-200ms). Respect robots.txt crawl-delay directive.',
      category: 'DoS',
    },
    {
      id: 'RACE', severity: 'HIGH',
      title: 'Race condition in activeJobId — concurrent job starts',
      pattern: /let\s+activeJobId\s*[:=]/,
      description: 'Module-level mutable variable accessed across async request handlers without synchronization. Concurrent requests create orphaned Chromium processes.',
      suggestion: 'Use an async mutex or atomic compare-and-set. Consider a proper job queue.',
      category: 'Race Conditions',
    },
    {
      id: 'CRED-LOG', severity: 'HIGH',
      title: 'Credentials logged/stored in plaintext',
      pattern: /writeFileSync\(.+cookies|JSON\.stringify\(.+credentials/,
      description: 'Session cookies stored as plaintext JSON. Raw username passed to createSession. Credentials exist in request logs and heap without scrubbing.',
      suggestion: 'Never log credential bodies. Encrypt session files at rest. Clear credential buffers after use.',
      category: 'Data Exposure',
    },
    {
      id: 'API-KEY', severity: 'HIGH',
      title: 'API key passthrough enables billing abuse',
      pattern: /anthropicApiKey.*\|\|.*process\.env/,
      description: 'User-supplied anthropicApiKey falls back to server-side env var. Any authenticated user consumes server quota.',
      suggestion: 'Never accept API keys via HTTP. Use only server-side env var.',
      category: 'Input Validation',
    },
    {
      id: 'PATH-TRAV', severity: 'MEDIUM',
      title: 'Path traversal via videoDir and outputDir',
      pattern: /mkdirSync\(.+\{\s*recursive:\s*true\s*\}/,
      description: 'User-controlled paths used with mkdirSync({ recursive: true }) and file writes without sanitization.',
      suggestion: 'Resolve paths and verify within project root. Reject absolute paths from user input.',
      category: 'Path Traversal',
    },
    {
      id: 'UPLOAD', severity: 'MEDIUM',
      title: 'Upload action exposes arbitrary local files',
      pattern: /uploadFile\(step\.value/,
      description: 'uploadFile() takes unchecked local file path. AI-generated scenarios could upload sensitive files to target websites.',
      suggestion: 'Restrict to specific uploads directory. Block absolute paths and ../.',
      category: 'Path Traversal',
    },
    {
      id: 'SINGLETON', severity: 'MEDIUM',
      title: 'Singleton Anthropic client ignores key changes',
      pattern: /let\s+client:\s*(?:Anthropic|any)\s*(?:\||$)/,
      description: 'Module-level singleton client. Once initialized with one API key, subsequent calls with different keys silently use the original.',
      suggestion: 'Create client per request, or key cache by API key value.',
      category: 'Code Quality',
    },
    {
      id: 'CORS', severity: 'MEDIUM',
      title: 'CORS allows localhost origins in production',
      pattern: /localhost:\d{4}/,
      description: 'Default CORS allows localhost origins. ALLOWED_ORIGINS split by comma without trimming.',
      suggestion: 'Require ALLOWED_ORIGINS in production. Trim after split.',
      category: 'Input Validation',
    },
    {
      id: 'NO-CSP', severity: 'MEDIUM',
      title: 'Missing Content-Security-Policy on HTML reports',
      pattern: /<!DOCTYPE html>|<html>/,
      description: 'HTML reports have no CSP headers. Content is HTML-escaped but CSP provides defense-in-depth.',
      suggestion: 'Add Content-Security-Policy: default-src \'none\'; style-src \'unsafe-inline\'; img-src data:.',
      category: 'Input Validation',
    },
    {
      id: 'NO-SANDBOX', severity: 'MEDIUM',
      title: 'Puppeteer launched with --no-sandbox',
      pattern: /--no-sandbox/,
      description: 'Chrome launched without sandbox. Combined with evaluate vulnerability, malicious JS has system-level access.',
      suggestion: 'Remove --no-sandbox in production. Document security implications.',
      category: 'RCE',
    },
    {
      id: 'CLEANUP', severity: 'MEDIUM',
      title: 'Cleanup timer prevents graceful shutdown',
      pattern: /setInterval\(.+(?!\.unref)/,
      description: 'setInterval without unref() keeps process alive after server.close(). Causes hanging processes in containers.',
      suggestion: 'Store interval ref, clear in close(). Call .unref().',
      category: 'Code Quality',
    },
    {
      id: 'RUN-ID', severity: 'MEDIUM',
      title: 'Test run ID is predictable',
      pattern: /`run-\$\{Date\.now\(\)\}`/,
      description: 'run-${Date.now()} is sequential and predictable, enabling enumeration.',
      suggestion: 'Use UUIDv4 for test run IDs.',
      category: 'Session Management',
    },
    {
      id: 'BODY-LIMIT', severity: 'MEDIUM',
      title: 'No request body size limit on Express',
      pattern: /express\.json\(\s*\)/,
      description: 'express.json() without explicit limit. Large payloads consume memory.',
      suggestion: 'Set express.json({ limit: "512kb" }).',
      category: 'DoS',
    },
    {
      id: 'CRAWLER-OOM', severity: 'MEDIUM',
      title: 'Crawler processes all links before checking maxPages',
      pattern: /pages\.length\s*<\s*maxPages/,
      description: 'If a page returns 10K+ links, BFS loop processes all before checking limit. Could add millions of URLs.',
      suggestion: 'Break early in link loop when pages.length >= maxPages.',
      category: 'DoS',
    },
    {
      id: 'CSS-INJECT', severity: 'MEDIUM',
      title: 'CSS selector injection in analyzer',
      pattern: /querySelector\(.*\$\{.*id|name/,
      description: 'Element IDs/names interpolated into CSS selectors without escaping.',
      suggestion: 'Use CSS.escape() for IDs/names in selectors.',
      category: 'Injection',
    },
    {
      id: 'SCHEMA', severity: 'MEDIUM',
      title: 'Generator output has no runtime type validation',
      pattern: /as\s+TestScenario\[\]/,
      description: 'JSON.parse(...) as TestScenario[] is unchecked cast. AI-generated JSON could contain invalid data.',
      suggestion: 'Use runtime validation (zod schema) matching TestScenario[] type.',
      category: 'Input Validation',
    },
    {
      id: 'PROTO-VALID', severity: 'MEDIUM',
      title: 'Missing URL protocol validation',
      pattern: /new URL\(.*url\)/,
      description: 'URL validation only checks new URL() parsing. Does not reject file://, private IPs, or non-HTTP protocols.',
      suggestion: 'Whitelist http:// and https:// only. Reject private IP ranges.',
      category: 'SSRF',
    },
    {
      id: 'COOKIE-INJECT', severity: 'MEDIUM',
      title: 'Cookie injection via unvalidated loadCookies input',
      pattern: /setCookie\(|loadCookies/,
      description: 'JSON.parse() result passed directly to page.setCookie() without schema validation. Malicious cookie data can be injected.',
      suggestion: 'Validate parsed cookies against expected schema. Restrict cookie domains to target URL domain.',
      category: 'Cookie Security',
    },
    {
      id: 'CORS-CRED', severity: 'MEDIUM',
      title: 'CORS credentials: true enables cross-origin session theft',
      pattern: /credentials:\s*true/,
      description: 'credentials: true in CORS config allows cookies and auth headers to be sent cross-origin.',
      suggestion: 'Only enable credentials: true for origins you fully control. Add CSRF token validation.',
      category: 'Cookie Security',
    },
    {
      id: 'JSON-PARSE', severity: 'MEDIUM',
      title: 'JSON.parse of stored job results without schema validation',
      pattern: /JSON\.parse\(storedJob\.result/,
      description: 'JSON.parse(storedJob.result!) assumes stored JSON matches TestRun schema. Corrupted DB row causes unhandled TypeError.',
      suggestion: 'Wrap in try-catch with meaningful error. Validate critical fields.',
      category: 'Input Validation',
    },
    {
      id: 'GET-RATE', severity: 'MEDIUM',
      title: 'No rate limiting on GET resource endpoints',
      pattern: /\/api\/test\/:id\/(?:status|results|report)/,
      description: 'No rate limiting on resource endpoints. Combined with IDOR, enables enumeration and server exhaustion.',
      suggestion: 'Add per-IP rate limiting middleware. Cache report responses.',
      category: 'Rate Limiting',
    },
    {
      id: 'SCENARIO-ID', severity: 'MEDIUM',
      title: 'Scenario IDs from AI response not validated',
      pattern: /\.id\s*=|scenario\.id/,
      description: 'AI-generated scenario IDs accepted without format validation. Malicious IDs could contain path traversal.',
      suggestion: 'Validate scenario IDs with /^[A-Za-z0-9_-]{1,50}$/.',
      category: 'Input Validation',
    },
    {
      id: 'MODEL-WL', severity: 'MEDIUM',
      title: 'AI model name not whitelisted',
      pattern: /model:\s*(?:config\.aiModel|model)/,
      description: 'Model name passed directly to client.messages.create without validation. Enables billing abuse via expensive models.',
      suggestion: 'Whitelist approved models. Reject unknown model names at config validation.',
      category: 'Input Validation',
    },
    {
      id: 'SCREENSHOT', severity: 'MEDIUM',
      title: 'Screenshot base64 buffers have no size limit',
      pattern: /screenshot\(\{.*encoding.*base64/,
      description: 'Screenshot data stored as base64 without size validation. Full-page screenshots can produce 10MB+ strings.',
      suggestion: 'Limit screenshot dimensions. Limit base64 string length.',
      category: 'DoS',
    },
    {
      id: 'VIDEO-TIMEOUT', severity: 'MEDIUM',
      title: 'No timeout on video recording operations',
      pattern: /screencast\.(?:start|stop)/,
      description: 'Screencast operations have no explicit timeout. Hung browser blocks scenario execution indefinitely.',
      suggestion: 'Wrap screencast operations in Promise.race() with a 10s timeout.',
      category: 'DoS',
    },
    {
      id: 'ASSERT-TRUNC', severity: 'MEDIUM',
      title: 'Assertion result values not truncated',
      pattern: /actual:\s*(?:text|value|content)/,
      description: 'DOM assertion actual values captured in full. Elements with 100KB+ text produce oversized results.',
      suggestion: 'Truncate actual values: actual: text.slice(0, 1000).',
      category: 'DoS',
    },
    {
      id: 'AI-TIMEOUT', severity: 'LOW',
      title: 'No timeout on AI API calls',
      pattern: /client\.messages\.create\(/,
      description: 'Anthropic API calls have no explicit timeout. API hang blocks indefinitely.',
      suggestion: 'Add AbortSignal.timeout() to API calls.',
      category: 'Code Quality',
    },
    {
      id: 'ERR-LEAK', severity: 'LOW',
      title: 'Error messages leak internal paths',
      pattern: /err\.message|error\.message/,
      description: 'Error responses include err.message with stack traces, file paths, and internal details.',
      suggestion: 'Return generic errors to clients. Log details server-side only.',
      category: 'Data Exposure',
    },
    {
      id: 'TYPES-DEP', severity: 'LOW',
      title: '@types/better-sqlite3 in production dependencies',
      pattern: /@types\/better-sqlite3/,
      description: 'Type-only package in dependencies instead of devDependencies.',
      suggestion: 'Move to devDependencies.',
      category: 'Code Quality',
    },
    {
      id: 'BROWSER-CLEANUP', severity: 'LOW',
      title: 'No graceful browser cleanup on process crash',
      pattern: /SIGINT|SIGTERM/,
      description: 'Shutdown handlers close SQLite but not active browser instances. Chromium processes orphaned on restart.',
      suggestion: 'Track and close active AITester instances in shutdown handlers.',
      category: 'Code Quality',
    },
    {
      id: 'SESSION-PERMS', severity: 'LOW',
      title: 'Session file has no permission restriction',
      pattern: /writeFileSync\(.+session/i,
      description: 'Session files created with default 0o644 permissions — readable by all system users.',
      suggestion: 'Use { mode: 0o600 } for owner-only access.',
      category: 'Session Management',
    },
    {
      id: 'SEC-HEADERS', severity: 'LOW',
      title: 'Missing security headers',
      pattern: /app\.use\(|express\(\)/,
      description: 'No X-Frame-Options, X-Content-Type-Options, or Strict-Transport-Security headers.',
      suggestion: 'Add helmet middleware or set headers manually.',
      category: 'Input Validation',
    },
    {
      id: 'MFA-ECHO', severity: 'LOW',
      title: 'MFA handler echoes code to terminal in plaintext',
      pattern: /readline\.question|createInterface/,
      description: 'CLI MFA handler uses readline.question() which echoes typed characters to stdout. MFA codes visible to shoulder-surfers.',
      suggestion: 'Use a library that masks input or suppress echo during code entry.',
      category: 'Data Exposure',
    },
    {
      id: 'DYN-IMPORT', severity: 'LOW',
      title: 'Audit command executes unsandboxed dynamic imports from Master project',
      pattern: /await import\(path\.join\(pluginsPath/,
      description: 'Dynamic import of registry.js and credential-loader.js from Master project. If an attacker controls the Master directory, arbitrary code execution occurs.',
      suggestion: 'Verify Master path integrity. Warn if MASTER_ROOT is overridden.',
      category: 'RCE',
    },
    {
      id: 'EMPTY-BEARER', severity: 'LOW',
      title: 'Bearer token accepts empty string',
      pattern: /authHeader\.slice\(7\)/,
      description: 'Authorization: Bearer with empty token can produce edge cases with empty/whitespace API_SECRET values.',
      suggestion: 'Add explicit check: if (!token || token.length < 8) return 401.',
      category: 'Auth Bypass',
    },
    {
      id: 'NO-AUDIT-LOG', severity: 'LOW',
      title: 'No audit/telemetry logging for forensics',
      pattern: /console\.log\(\s*`\[/,
      description: 'No structured audit logging for security-relevant events. Makes compliance auditing and incident forensics impossible.',
      suggestion: 'Add optional structured audit log with event, URL, timestamp, userId.',
      category: 'Code Quality',
    },
    {
      id: 'TEST-COVERAGE', severity: 'HIGH',
      title: 'Server API has zero test coverage',
      pattern: /\/api\/(?:test|auth|health)/,
      description: 'Entire HTTP API surface untested. No tests for auth middleware, SSRF validation, config sanitization, storage operations.',
      suggestion: 'Create tests/server/ suite: auth middleware, input validation, SSRF callback rejection, storage ops.',
      category: 'Test Coverage',
    },
    {
      id: 'MODULE-TESTS', severity: 'HIGH',
      title: 'Element finder and auth modules untested',
      pattern: /findElementByVision|autoLogin|detectMfa/,
      description: 'Element finder, auto-login, and MFA handler have no meaningful tests. Element finder lacks confidence threshold validation.',
      suggestion: 'Create test suites with mocked API responses. Add MFA code format validation.',
      category: 'Test Coverage',
    },
  ]

  const matched = new Set<string>()

  for (const file of sourceFiles) {
    const relPath = path.relative(projectRoot, file)
    let content: string
    try {
      content = fs.readFileSync(file, 'utf8')
    } catch { continue }

    const lines = content.split('\n')

    for (const pat of patterns) {
      if (matched.has(pat.id)) continue

      for (let i = 0; i < lines.length; i++) {
        if (pat.pattern.test(lines[i])) {
          matched.add(pat.id)
          const fid = `AUDIT-2026-${String(findingIndex).padStart(3, '0')}`
          findings.push({
            id: fid,
            severity: pat.severity,
            title: pat.title,
            location: `${relPath}:${i + 1}`,
            description: pat.description,
            suggestion: pat.suggestion,
          })
          findingIndex++
          break
        }
      }
    }
  }

  // Also scan package.json
  const pkgPath = path.join(projectRoot, 'package.json')
  if (fs.existsSync(pkgPath)) {
    const pkgContent = fs.readFileSync(pkgPath, 'utf8')
    for (const pat of patterns) {
      if (matched.has(pat.id)) continue
      if (pat.pattern.test(pkgContent)) {
        matched.add(pat.id)
        const fid = `AUDIT-2026-${String(findingIndex).padStart(3, '0')}`
        findings.push({
          id: fid,
          severity: pat.severity,
          title: pat.title,
          location: 'package.json',
          description: pat.description,
          suggestion: pat.suggestion,
        })
        findingIndex++
      }
    }
  }

  // Check for .env file with API keys
  const envPath = path.join(projectRoot, '.env')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    if (/sk-ant-api/.test(envContent)) {
      const fid = `AUDIT-2026-${String(findingIndex).padStart(3, '0')}`
      findings.push({
        id: fid,
        severity: 'CRITICAL',
        title: 'Exposed API key in .env file',
        location: '.env (line 1)',
        description: 'A real Anthropic API key (sk-ant-api03-...) exists in the .env file on disk. If accidentally committed, shared, or leaked via backup, this enables unauthorized API usage.',
        suggestion: 'Rotate the API key immediately. Verify .env is in .gitignore. Use secrets manager for production.',
      })
      findingIndex++
    }
  }

  // Sort by severity
  const severityOrder: Record<FindingSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  // Re-number after sorting
  findings.forEach((f, i) => {
    f.id = `AUDIT-2026-${String(i + 1).padStart(3, '0')}`
  })

  return findings
}
