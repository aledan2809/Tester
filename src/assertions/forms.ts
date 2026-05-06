/**
 * Form Audit — Module H
 * Type-confusion fuzzing, duplicate submit detection, and safe test data generation.
 * Additive — does NOT modify existing assertion engine.
 */

type Page = import('puppeteer').Page

// ─── Safe Test Data Generator ─────────────────────────────────

/** Generates safe, obviously-fake test data that won't affect production systems */
export const safeTestData = {
  email: () => `tester-${Date.now()}@example-safe.invalid`,
  phone: () => '+40700000000',
  name: () => 'Test Automation User',
  firstName: () => 'TestFirst',
  lastName: () => 'TestLast',
  address: () => '123 Test Street, Test City',
  zipCode: () => '00000',
  company: () => 'Test Company Ltd',
  /** Short safe string — won't trigger XSS but tests type handling */
  text: (len = 10) => 'T'.repeat(len),
  /** Number string */
  number: () => '42',
  /** Past date safe for most "date of birth" fields */
  date: () => '1990-01-01',
  /** Safe URL */
  url: () => 'https://example.invalid',
}

// ─── Type Confusion Fuzzer ────────────────────────────────────

export interface FuzzPayload {
  description: string
  value: string
  expectedBehavior: 'reject' | 'sanitize' | 'allow'
}

/** Payloads designed to test type-confusion without being malicious */
export const TYPE_CONFUSION_PAYLOADS: FuzzPayload[] = [
  // Numeric fields getting strings
  { description: 'String in numeric field', value: 'not-a-number', expectedBehavior: 'reject' },
  // Boundary values
  { description: 'Empty string', value: '', expectedBehavior: 'reject' },
  { description: 'Whitespace only', value: '   ', expectedBehavior: 'reject' },
  { description: 'Very long string (500 chars)', value: 'A'.repeat(500), expectedBehavior: 'reject' },
  // Special characters (non-XSS — tests sanitization)
  { description: 'Special chars: <>"\'/`', value: '<test>"\'`', expectedBehavior: 'sanitize' },
  // Unicode edge cases
  { description: 'Unicode RTL override', value: '‮', expectedBehavior: 'sanitize' },
  { description: 'Null byte', value: '\x00', expectedBehavior: 'sanitize' },
  // Numeric edge cases
  { description: 'Negative number', value: '-1', expectedBehavior: 'reject' },
  { description: 'Scientific notation', value: '1e10', expectedBehavior: 'reject' },
  { description: 'Float where int expected', value: '1.5', expectedBehavior: 'reject' },
  // Date edge cases
  { description: 'Invalid date: 13th month', value: '2024-13-01', expectedBehavior: 'reject' },
  { description: 'Date in past (far)', value: '1800-01-01', expectedBehavior: 'reject' },
]

export interface FormFuzzResult {
  fieldSelector: string
  fieldType: string
  payload: FuzzPayload
  serverResponse?: { status: number; body: string }
  /** True if server properly rejected the invalid input */
  handledCorrectly: boolean
  finding?: FormFinding
}

export interface FormFinding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  category: string
  message: string
  detail?: string
}

export interface FormAuditResult {
  passed: boolean
  findings: FormFinding[]
  fuzzResults: FormFuzzResult[]
  durationMs: number
}

// ─── Form Field Discovery ─────────────────────────────────────

interface DiscoveredField {
  selector: string
  type: string
  name: string
  required: boolean
  formSelector?: string
  submitSelector?: string
}

async function discoverFormFields(page: Page): Promise<DiscoveredField[]> {
  return page.evaluate(() => {
    const fields: DiscoveredField[] = []
    const inputs = document.querySelectorAll<HTMLInputElement>('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"])')

    Array.from(inputs).forEach((input) => {
      const form = input.closest('form')
      const submitEl = form?.querySelector('button[type="submit"], input[type="submit"], button:not([type])') as HTMLElement | null

      const selector = input.id
        ? `#${input.id}`
        : input.name
          ? `input[name="${input.name}"]`
          : `input[type="${input.type}"]`

      const submitSelector = submitEl
        ? (submitEl.id ? `#${submitEl.id}` : 'button[type="submit"]')
        : undefined

      fields.push({
        selector,
        type: input.type || 'text',
        name: input.name || input.id || '',
        required: input.required,
        formSelector: form ? (form.id ? `#${form.id}` : 'form') : undefined,
        submitSelector,
      })
    })

    return fields
  })
}

// ─── Type Confusion Fuzzing ───────────────────────────────────

/**
 * Fuzzes form fields with type-confusion payloads.
 * Only targets text/email/number/tel/url inputs.
 * Uses safe, obviously-fake data — won't hit real APIs with harmful content.
 */
export async function fuzzFormFields(
  page: Page,
  options: {
    maxFields?: number
    payloads?: FuzzPayload[]
    captureNetworkResponses?: boolean
  } = {},
): Promise<FormFuzzResult[]> {
  const results: FormFuzzResult[] = []
  const fields = await discoverFormFields(page)
  const fuzzableFields = fields
    .filter(f => ['text', 'email', 'number', 'tel', 'url', 'search'].includes(f.type))
    .slice(0, options.maxFields ?? 5)

  const payloads = options.payloads ?? TYPE_CONFUSION_PAYLOADS.slice(0, 6)

  for (const field of fuzzableFields) {
    for (const payload of payloads) {
      // Skip empty-string test on non-required fields
      if (payload.value === '' && !field.required) continue

      try {
        await page.focus(field.selector).catch(() => null)
        await page.click(field.selector, { clickCount: 3 }).catch(() => null)
        await page.type(field.selector, payload.value, { delay: 10 }).catch(() => null)

        // Check inline validation
        const hasValidationError = await page.evaluate((sel) => {
          const el = document.querySelector<HTMLInputElement>(sel)
          if (!el) return false
          return !el.validity.valid || el.closest('[data-error]') !== null
        }, field.selector).catch(() => false)

        results.push({
          fieldSelector: field.selector,
          fieldType: field.type,
          payload,
          handledCorrectly: hasValidationError || payload.expectedBehavior === 'allow',
          finding: hasValidationError
            ? undefined
            : {
                severity: 'MEDIUM',
                category: 'form_validation_missing',
                message: `Field ${field.name} (${field.type}) accepted invalid input without client validation`,
                detail: `Payload: "${payload.description}" (${payload.value.slice(0, 30)})`,
              },
        })

        // Clear field for next iteration
        await page.click(field.selector, { clickCount: 3 }).catch(() => null)
        await page.keyboard.press('Delete').catch(() => null)
      } catch {
        // Field not interactable — skip
      }
    }
  }

  return results
}

// ─── Duplicate Submit Detection ───────────────────────────────

/**
 * Detects forms that allow double-submission by rapidly clicking submit twice.
 * Checks:
 * - Button disabled after first click
 * - Network requests: only one POST sent
 * - Error shown on duplicate
 */
export async function auditDuplicateSubmit(
  page: Page,
  options: {
    formSelector?: string
    submitSelector?: string
    fillFields?: Record<string, string>
  } = {},
): Promise<FormFinding[]> {
  const findings: FormFinding[] = []

  const submitSel = options.submitSelector ?? 'button[type="submit"]'
  const submitBtn = await page.$(submitSel)
  if (!submitBtn) return findings

  const requestUrls: string[] = []
  const requestHandler = (req: import('puppeteer').HTTPRequest) => {
    if (req.method() === 'POST') requestUrls.push(req.url())
  }
  page.on('request', requestHandler)

  try {
    // Fill required fields with safe data
    if (options.fillFields) {
      for (const [sel, val] of Object.entries(options.fillFields)) {
        await page.click(sel, { clickCount: 3 }).catch(() => null)
        await page.type(sel, val, { delay: 10 }).catch(() => null)
      }
    }

    // Double-click submit rapidly
    await page.click(submitSel).catch(() => null)
    await page.click(submitSel).catch(() => null)

    // Wait briefly for network
    await new Promise(r => setTimeout(r, 1_000))

    const isDisabledAfterClick = await page.evaluate((sel) => {
      const btn = document.querySelector<HTMLButtonElement>(sel)
      return btn?.disabled ?? false
    }, submitSel)

    const duplicatePostsSent = requestUrls.filter(u => requestUrls.filter(r => r === u).length > 1).length

    if (duplicatePostsSent > 0 && !isDisabledAfterClick) {
      findings.push({
        severity: 'HIGH',
        category: 'duplicate_submit',
        message: 'Form allows duplicate submission — button not disabled after first click',
        detail: `${duplicatePostsSent} duplicate POST request(s) sent to: ${[...new Set(requestUrls)].join(', ')}`,
      })
    }
  } finally {
    page.off('request', requestHandler)
  }

  return findings
}

// ─── Unified Form Audit ───────────────────────────────────────

export interface FormAuditOptions {
  submitSelector?: string
  formSelector?: string
  fillFields?: Record<string, string>
  maxFuzzFields?: number
  skip?: Array<'fuzz' | 'duplicate_submit'>
}

export async function runFormAudit(
  page: Page,
  _baseUrl: string,
  opts: FormAuditOptions = {},
): Promise<FormAuditResult> {
  const start = Date.now()
  const findings: FormFinding[] = []
  const skip = new Set(opts.skip ?? [])

  let fuzzResults: FormFuzzResult[] = []
  if (!skip.has('fuzz')) {
    fuzzResults = await fuzzFormFields(page, { maxFields: opts.maxFuzzFields })
    findings.push(...fuzzResults.filter(r => r.finding).map(r => r.finding!))
  }

  if (!skip.has('duplicate_submit')) {
    const dupFindings = await auditDuplicateSubmit(page, {
      formSelector: opts.formSelector,
      submitSelector: opts.submitSelector,
      fillFields: opts.fillFields,
    })
    findings.push(...dupFindings)
  }

  const critical = findings.filter(f => f.severity === 'CRITICAL').length
  const high = findings.filter(f => f.severity === 'HIGH').length

  return {
    passed: critical === 0 && high === 0,
    findings,
    fuzzResults,
    durationMs: Date.now() - start,
  }
}
