import puppeteer from 'puppeteer'

const email = 'alex.danciulescu@outlook.com'
const password = 'MihDan74!?><'
const loginUrl = 'https://pro.4pro.io/login'

// Mimic BrowserCore.launch() exactly
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--window-size=1280,800']
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800 })

// Same request interception as BrowserCore
await page.setRequestInterception(true)
page.on('request', (req) => {
  const resourceType = req.resourceType()
  if (['font', 'media'].includes(resourceType)) {
    req.abort()
  } else {
    req.continue()
  }
})

console.log('Navigating to login...')
await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 })
console.log('Page URL:', page.url())

// detectLoginFields equivalent
const fields = await page.evaluate(() => {
  const passwordInput = document.querySelector('input[type="password"]')
  if (!passwordInput) return null
  const passwordSelector = passwordInput.id ? `#${passwordInput.id}` : passwordInput.name ? `input[name="${passwordInput.name}"]` : 'input[type="password"]'
  const form = passwordInput.closest('form')
  const container = form || document.body
  const usernameInput = container.querySelector('input[type="email"], input[name*="email"], input[name*="user"], input[name*="login"], input[name*="account"], input[type="text"]')
  if (!usernameInput) return null
  const usernameSelector = usernameInput.id ? `#${usernameInput.id}` : usernameInput.name ? `input[name="${usernameInput.name}"]` : 'input[type="email"], input[type="text"]'
  const submitBtn = container.querySelector('button[type="submit"], input[type="submit"], button:not([type]), button[class*="login"], button[class*="signin"]')
  const submitSelector = submitBtn ? (submitBtn.id ? `#${submitBtn.id}` : submitBtn.getAttribute('type') === 'submit' ? (form ? 'form button[type="submit"], form input[type="submit"]' : 'button[type="submit"]') : 'button:not([type])') : 'button[type="submit"]'
  return { usernameSelector, passwordSelector, submitSelector }
})
console.log('Fields detected:', fields)

// Fill via page.evaluate with 4 args
await page.evaluate((uSel, pSel, u, p) => {
  const uEl = document.querySelector(uSel)
  const pEl = document.querySelector(pSel)
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (uEl) { setter?.call(uEl, u); uEl.dispatchEvent(new Event('input', { bubbles: true })); uEl.dispatchEvent(new Event('change', { bubbles: true })) }
  if (pEl) { setter?.call(pEl, p); pEl.dispatchEvent(new Event('input', { bubbles: true })); pEl.dispatchEvent(new Event('change', { bubbles: true })) }
}, fields.usernameSelector, fields.passwordSelector, email, password)

// Read back values
const values = await page.evaluate(() => ({
  email: document.getElementById('login-email')?.value,
  password: document.getElementById('login-password')?.value,
}))
console.log('Values after fill:', values)

// Get submit and click
const submitEl = await page.$(fields.submitSelector)
console.log('Submit found:', !!submitEl)
await submitEl.click()
await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {})

const afterUrl = page.url()
await new Promise(r => setTimeout(r, 2000))
const errorAlert = await page.$eval('[role="alert"]', el => el.textContent).catch(() => 'no alert')
console.log('Result:', { url: afterUrl, error: errorAlert })

await browser.close()
