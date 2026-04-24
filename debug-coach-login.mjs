import puppeteer from 'puppeteer'

const email = 'alex.danciulescu@outlook.com'
const password = 'MihDan74!?><'

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] })
const page = await browser.newPage()

// Intercept API response to see what server returns
page.on('response', async (resp) => {
  if (resp.url().includes('/api/auth/login')) {
    try {
      const json = await resp.json()
      console.log('API response status:', resp.status(), JSON.stringify(json))
    } catch {}
  }
})

await page.goto('https://pro.4pro.io/login', { waitUntil: 'networkidle2' })

// Fill form
await page.evaluate((e, p) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  const emailEl = document.getElementById('login-email')
  const passEl = document.getElementById('login-password')
  setter?.call(emailEl, e)
  emailEl?.dispatchEvent(new Event('input', { bubbles: true }))
  setter?.call(passEl, p)
  passEl?.dispatchEvent(new Event('input', { bubbles: true }))
}, email, password)

const values = await page.evaluate(() => ({
  email: document.getElementById('login-email')?.value,
  password: document.getElementById('login-password')?.value
}))
console.log('Form values:', values)

// Submit
await page.click('button[type="submit"]')
await new Promise(r => setTimeout(r, 5000))

// Get all visible alert/error elements with details
const errors = await page.evaluate(() => {
  const els = document.querySelectorAll('[role="alert"], .text-red-700, .text-red-500, [class*="bg-red-"]')
  return Array.from(els).map(el => ({
    tag: el.tagName,
    role: el.getAttribute('role'),
    classes: el.className,
    text: el.textContent?.trim(),
    visible: window.getComputedStyle(el).display !== 'none'
  }))
})
console.log('Error elements:', JSON.stringify(errors, null, 2))
console.log('URL after submit:', page.url())

await browser.close()
