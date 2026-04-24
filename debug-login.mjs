import puppeteer from 'puppeteer'

const email = 'alex.danciulescu@outlook.com'
const password = 'MihDan74!?><'

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
const page = await browser.newPage()

console.log('Navigating to login page...')
await page.goto('https://pro.4pro.io/login', { waitUntil: 'networkidle2', timeout: 30000 })
console.log('Page URL:', page.url())

// Check what inputs exist
const inputs = await page.evaluate(() =>
  Array.from(document.querySelectorAll('input')).map(el => ({
    id: el.id, name: el.name, type: el.type
  }))
)
console.log('Inputs found:', inputs)

// Method 1: native setter
await page.evaluate((e, p) => {
  const emailEl = document.getElementById('login-email')
  const passEl = document.getElementById('login-password')
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(emailEl, e)
  emailEl?.dispatchEvent(new Event('input', { bubbles: true }))
  emailEl?.dispatchEvent(new Event('change', { bubbles: true }))
  setter?.call(passEl, p)
  passEl?.dispatchEvent(new Event('input', { bubbles: true }))
  passEl?.dispatchEvent(new Event('change', { bubbles: true }))
}, email, password)

// Read back values
const values = await page.evaluate(() => ({
  email: document.getElementById('login-email')?.value,
  password: document.getElementById('login-password')?.value,
}))
console.log('Values after fill:', values)

// Click submit
await page.click('button[type="submit"]')
await new Promise(r => setTimeout(r, 3000))

const afterUrl = page.url()
const alertText = await page.$eval('[role="alert"]', el => el.textContent).catch(() => 'no alert found')
console.log('After submit:', { url: afterUrl, alert: alertText })

await browser.close()
