import { test, expect } from '@playwright/test'

const BASE = 'https://tutor.knowbest.ro'
const EMAIL = 'alexdanciulescu@gmail.com'
const PASSWORD = 'MihDan74!?><'

test.describe('Tutor Import Page - Real UI Test', () => {

  test('Login and inspect import page', async ({ page, context }) => {
    // Step 1: Get CSRF token
    const csrfRes = await context.request.get(`${BASE}/api/auth/csrf`)
    const csrfData = await csrfRes.json()
    console.log('CSRF token:', csrfData.csrfToken ? 'obtained' : 'MISSING')

    // Step 2: Login via NextAuth credentials callback
    const loginRes = await context.request.post(`${BASE}/api/auth/callback/credentials`, {
      form: {
        email: EMAIL,
        password: PASSWORD,
        csrfToken: csrfData.csrfToken,
        json: 'true',
      },
    })
    console.log('Login status:', loginRes.status())

    // Step 3: Check if we have session
    const sessionRes = await context.request.get(`${BASE}/api/auth/session`)
    const session = await sessionRes.json()
    console.log('Session:', JSON.stringify(session).substring(0, 200))

    if (!session?.user) {
      console.log('NO SESSION - login failed')
      // Try reading the actual error
      const loginBody = await loginRes.text()
      console.log('Login response:', loginBody.substring(0, 300))
      return
    }

    console.log('LOGGED IN as:', session.user.email)

    // Step 4: Go to import page
    await page.goto(`${BASE}/en/dashboard/admin/questions/import`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'e2e-report/import-page.png', fullPage: true })

    const url = page.url()
    console.log('\nImport page URL:', url)

    if (url.includes('signin')) {
      console.log('FAILED: redirected to signin')
      return
    }

    // Step 5: Full form inspection
    console.log('\n=== FORM FIELDS ===')
    const inputs = page.locator('input, select')
    const count = await inputs.count()
    for (let i = 0; i < count; i++) {
      const el = inputs.nth(i)
      const type = await el.getAttribute('type') || 'select'
      const placeholder = await el.getAttribute('placeholder') || ''
      const required = await el.evaluate(e => (e as HTMLInputElement).required)
      const accept = await el.getAttribute('accept') || ''
      console.log(`  [${i}] type="${type}" ph="${placeholder}" required=${required} accept="${accept}"`)
    }

    // Step 6: Labels
    console.log('\n=== LABELS ===')
    const labels = page.locator('label')
    for (let i = 0; i < await labels.count(); i++) {
      console.log(`  [${i}] "${(await labels.nth(i).textContent())?.trim()}"`)
    }

    // Step 7: Specific checks
    const fileAccept = await page.locator('input[type="file"]').getAttribute('accept')
    console.log('\n=== RESULTS ===')
    console.log('File accept:', fileAccept)
    console.log('.jfif supported:', fileAccept?.includes('.jfif'))

    const requiredCount = await page.locator('input[required]').count()
    console.log('Required inputs count:', requiredCount)

    // List which ones are required
    const reqInputs = page.locator('input[required]')
    for (let i = 0; i < requiredCount; i++) {
      const type = await reqInputs.nth(i).getAttribute('type')
      const ph = await reqInputs.nth(i).getAttribute('placeholder')
      console.log(`  Required: type=${type} placeholder="${ph}"`)
    }
  })
})
