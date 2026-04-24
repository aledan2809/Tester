import { chromium } from '@playwright/test';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://tutor.knowbest.ro';
const DOMAIN_ID = 'cmnoldd7100007slwe2ukyvc4';
const PASSWORD = 'TestPass123!';
const DB_URL = 'postgresql://neondb_owner:npg_YJsN0mvguaD7@ep-polished-tree-aizc8sc8-pooler.c-4.us-east-1.aws.neon.tech/tutor?sslmode=require';

const SCREENSHOT_DIR = '/Users/danciulescu/Projects/Tester/e2e-report/role-tests';
const REPORT_PATH = '/Users/danciulescu/Projects/Tester/reports/tutor-role-access-test-20260415.md';

const TEST_USERS = [
  { email: 'test_admin@test.com', name: 'Test Admin', role: 'ADMIN' },
  { email: 'test_instructor@test.com', name: 'Test Instructor', role: 'INSTRUCTOR' },
  { email: 'test_student@test.com', name: 'Test Student', role: 'STUDENT' },
  { email: 'test_watcher@test.com', name: 'Test Watcher', role: 'WATCHER' },
];

const PAGES = [
  { name: 'dashboard', path: '/en/dashboard' },
  { name: 'admin', path: '/en/dashboard/admin' },
  { name: 'admin-questions', path: '/en/dashboard/admin/questions' },
  { name: 'practice', path: '/en/dashboard/practice' },
  { name: 'exams', path: '/en/dashboard/exams' },
  { name: 'instructor', path: '/en/dashboard/instructor' },
];

function generateCuid() {
  const ts = Date.now().toString(36);
  const rand = randomUUID().replace(/-/g, '').slice(0, 16);
  return 'cm' + ts + rand;
}

// ── Step 1: Create test users in DB ──
async function setupUsers() {
  const pool = new Pool({ connectionString: DB_URL });
  const hashedPassword = await bcrypt.hash(PASSWORD, 12);
  const now = new Date().toISOString();
  const userIds = {};

  for (const user of TEST_USERS) {
    // Check if user exists
    const existing = await pool.query('SELECT id FROM "User" WHERE email = $1', [user.email]);
    let userId;

    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;
      // Update password
      await pool.query('UPDATE "User" SET password = $1, "updatedAt" = $2 WHERE id = $3', [hashedPassword, now, userId]);
      console.log(`  Updated existing user: ${user.email} (${userId})`);
    } else {
      userId = generateCuid();
      await pool.query(
        `INSERT INTO "User" (id, name, email, password, "isSuperAdmin", locale, "createdAt", "updatedAt", "isBanned")
         VALUES ($1, $2, $3, $4, false, 'en', $5, $5, false)`,
        [userId, user.name, user.email, hashedPassword, now]
      );
      console.log(`  Created user: ${user.email} (${userId})`);
    }
    userIds[user.role] = userId;

    // Check/create enrollment
    const existingEnr = await pool.query(
      'SELECT id FROM "Enrollment" WHERE "userId" = $1 AND "domainId" = $2',
      [userId, DOMAIN_ID]
    );

    if (existingEnr.rows.length > 0) {
      await pool.query(
        'UPDATE "Enrollment" SET roles = $1, "isActive" = true, "updatedAt" = $2 WHERE "userId" = $3 AND "domainId" = $4',
        [`{${user.role}}`, now, userId, DOMAIN_ID]
      );
      console.log(`  Updated enrollment: ${user.role}`);
    } else {
      const enrId = generateCuid();
      await pool.query(
        `INSERT INTO "Enrollment" (id, "userId", "domainId", roles, "isActive", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, true, $5, $5)`,
        [enrId, userId, DOMAIN_ID, `{${user.role}}`, now]
      );
      console.log(`  Created enrollment: ${user.role}`);
    }
  }

  await pool.end();
  return userIds;
}

// ── Step 2: Login via NextAuth API ──
async function loginUser(context, email) {
  // Get CSRF token
  const csrfResp = await context.request.get(`${BASE_URL}/api/auth/csrf`);
  const csrfData = await csrfResp.json();
  let csrfToken = csrfData.csrfToken;

  // Login with retry on 429
  for (let attempt = 1; attempt <= 3; attempt++) {
    const loginResp = await context.request.post(`${BASE_URL}/api/auth/callback/credentials`, {
      form: {
        email,
        password: PASSWORD,
        csrfToken,
        redirect: 'false',
        callbackUrl: `${BASE_URL}/en/dashboard`,
        json: 'true',
      },
    });

    const status = loginResp.status();
    console.log(`  Login ${email}: status ${status} (attempt ${attempt})`);

    if (status === 429) {
      const wait = attempt * 20000;
      console.log(`  Rate limited, waiting ${wait/1000}s...`);
      await new Promise(r => setTimeout(r, wait));
      // Get fresh CSRF token
      const freshCsrf = await context.request.get(`${BASE_URL}/api/auth/csrf`);
      const freshData = await freshCsrf.json();
      csrfToken = freshData.csrfToken;
      continue;
    }

    return status >= 200 && status < 400;
  }
  return false;
}

// ── Step 3: Determine access status ──
function determineAccess(page, url, finalUrl, status) {
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'FAIL (404)';
  if (status >= 400) return `FAIL (${status})`;

  const finalPath = new URL(finalUrl).pathname;
  const targetPath = new URL(url).pathname;

  // If redirected to login or sign-in page
  if (finalPath.includes('/login') || finalPath.includes('/sign-in') || finalPath.includes('/auth')) {
    return 'FAIL (redirect to login)';
  }

  // If redirected away from target
  if (!finalPath.startsWith(targetPath) && targetPath !== '/en/dashboard') {
    return `FAIL (redirect to ${finalPath})`;
  }

  return 'PASS';
}

// ── Step 4: Run tests ──
async function runTests() {
  console.log('\n=== Setting up test users ===');
  await setupUsers();

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });

  const results = {};
  const notes = [];

  const browser = await chromium.launch({ headless: true });

  for (const user of TEST_USERS) {
    console.log(`\n=== Testing role: ${user.role} (${user.email}) ===`);
    results[user.role] = {};

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
    });

    const loggedIn = await loginUser(context, user.email);
    if (!loggedIn) {
      console.log(`  ❌ Login failed for ${user.email}`);
      for (const pg of PAGES) {
        results[user.role][pg.name] = 'FAIL (login failed)';
      }
      notes.push(`${user.role}: Login failed entirely for ${user.email}`);
      await context.close();
      continue;
    }

    const page = await context.newPage();

    for (const pg of PAGES) {
      const fullUrl = `${BASE_URL}${pg.path}`;
      console.log(`  Navigating to ${pg.path}...`);

      try {
        const response = await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 30000 });
        const status = response?.status() || 0;
        const finalUrl = page.url();

        // Wait a bit for any client-side redirects
        await page.waitForTimeout(2000);
        const finalUrlAfterWait = page.url();

        const access = determineAccess(page, fullUrl, finalUrlAfterWait, status);
        results[user.role][pg.name] = access;

        // Screenshot
        const screenshotName = `${user.role.toLowerCase()}-${pg.name}.png`;
        await page.screenshot({
          fullPage: true,
          path: path.join(SCREENSHOT_DIR, screenshotName),
        });

        console.log(`    ${pg.name}: ${access} (final: ${new URL(finalUrlAfterWait).pathname})`);

        if (access !== 'PASS') {
          notes.push(`${user.role} on ${pg.path}: ${access}`);
        }
      } catch (err) {
        results[user.role][pg.name] = `FAIL (${err.message.slice(0, 50)})`;
        console.log(`    ${pg.name}: ERROR - ${err.message.slice(0, 80)}`);
        notes.push(`${user.role} on ${pg.path}: Error - ${err.message.slice(0, 80)}`);
      }
    }

    await context.close();

    // Rate limit protection - generous delay between users
    console.log('  Waiting 15s to avoid rate limiting...');
    await new Promise(r => setTimeout(r, 15000));
  }

  await browser.close();

  // ── Step 5: Generate report ──
  generateReport(results, notes);
}

function generateReport(results, notes) {
  const roles = TEST_USERS.map(u => u.role);
  const pages = PAGES;

  let md = `# Tutor Role Access Test Report\n\n`;
  md += `**Date:** 2026-04-15\n`;
  md += `**Target:** ${BASE_URL}\n`;
  md += `**Domain:** Aviation (${DOMAIN_ID})\n\n`;

  md += `## Access Matrix\n\n`;
  md += `| Page | ${roles.join(' | ')} |\n`;
  md += `| --- | ${roles.map(() => '---').join(' | ')} |\n`;

  for (const pg of pages) {
    const cells = roles.map(role => {
      const status = results[role]?.[pg.name] || 'N/A';
      if (status === 'PASS') return '✅ PASS';
      if (status.startsWith('FORBIDDEN')) return '🚫 FORBIDDEN';
      return `❌ ${status}`;
    });
    md += `| ${pg.path} | ${cells.join(' | ')} |\n`;
  }

  md += `\n## Test Users\n\n`;
  md += `| Email | Role |\n`;
  md += `| --- | --- |\n`;
  for (const user of TEST_USERS) {
    md += `| ${user.email} | ${user.role} |\n`;
  }

  if (notes.length > 0) {
    md += `\n## Notes\n\n`;
    for (const note of notes) {
      md += `- ${note}\n`;
    }
  }

  md += `\n## Screenshots\n\n`;
  md += `All screenshots saved in: \`e2e-report/role-tests/\`\n\n`;
  for (const role of roles) {
    md += `### ${role}\n`;
    for (const pg of pages) {
      const filename = `${role.toLowerCase()}-${pg.name}.png`;
      md += `- [${pg.path}](../../e2e-report/role-tests/${filename})\n`;
    }
    md += `\n`;
  }

  fs.writeFileSync(REPORT_PATH, md);
  console.log(`\n✅ Report saved to: ${REPORT_PATH}`);
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
