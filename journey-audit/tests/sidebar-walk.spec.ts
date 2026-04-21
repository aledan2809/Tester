/**
 * Project-agnostic user journey audit.
 * Loads a config JSON for the target project from env JOURNEY_PROJECT,
 * logs in, walks every nav link, captures screenshots, reports findings.
 *
 * Usage:
 *   JOURNEY_PROJECT=tradeinvest \
 *   JOURNEY_EMAIL=you@example.com \
 *   JOURNEY_PASSWORD='...' \
 *     npx playwright test --config=journey-audit/playwright.config.ts --headed
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

interface NavLink {
  name: string;
  href: string;
}

interface JourneyConfig {
  name: string;
  baseUrl: string;
  login: {
    path: string;
    emailSelector: string;
    passwordSelector: string;
    submitSelector: string;
    successUrlPattern: string;
  };
  credentials: {
    emailEnv: string;
    passwordEnv: string;
  };
  navLinks: NavLink[];
  onboardingMarkers?: string;
  emptyStateMarkers?: string;
  errorMarkers?: string;
  viewport: { width: number; height: number };
  pageTimeout?: number;
  settleDelay?: number;
}

function loadConfig(): JourneyConfig {
  const projectName = process.env.JOURNEY_PROJECT;
  if (!projectName) {
    throw new Error("JOURNEY_PROJECT env var required (e.g. JOURNEY_PROJECT=tradeinvest)");
  }
  const configPath = path.resolve(
    __dirname,
    "..",
    "configs",
    `${projectName}.json`
  );
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}`);
  }
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8")) as JourneyConfig;
  return cfg;
}

const CFG = loadConfig();
const RESULTS_DIR = path.resolve(
  __dirname,
  "..",
  "results",
  CFG.name.toLowerCase().replace(/\s+/g, "-")
);
fs.mkdirSync(path.join(RESULTS_DIR, "screenshots"), { recursive: true });

test.use({ baseURL: CFG.baseUrl, viewport: CFG.viewport });

test(`[${CFG.name}] user journey — every nav link walked + screenshots`, async ({
  browser,
}) => {
  const EMAIL = process.env[CFG.credentials.emailEnv];
  const PASSWORD = process.env[CFG.credentials.passwordEnv];
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      `Credentials missing. Set ${CFG.credentials.emailEnv} and ${CFG.credentials.passwordEnv}`
    );
  }

  const ctx = await browser.newContext({
    baseURL: CFG.baseUrl,
    viewport: CFG.viewport,
  });
  const page = await ctx.newPage();

  // Login
  await page.goto(CFG.login.path);
  await page.fill(CFG.login.emailSelector, EMAIL);
  await page.fill(CFG.login.passwordSelector, PASSWORD);
  await Promise.all([
    page.waitForURL(new RegExp(CFG.login.successUrlPattern), { timeout: 15000 }),
    page.click(CFG.login.submitSelector),
  ]);

  const bar = "═".repeat(63);
  console.log(`\n${bar}`);
  console.log(`  JOURNEY AUDIT — ${CFG.name} (${CFG.baseUrl})`);
  console.log(`${bar}\n`);

  const findings: {
    page: string;
    href: string;
    status: string;
    httpStatus: number;
    h1: string;
    notes: string[];
    screenshot: string;
  }[] = [];

  for (const link of CFG.navLinks) {
    const notes: string[] = [];
    let status = "OK";
    let httpStatus = 0;
    let h1 = "";
    const safeName = link.href.replace(/\//g, "_").replace(/^_/, "") || "root";
    const screenshot = path.join(RESULTS_DIR, "screenshots", `${safeName}.png`);

    try {
      const res = await page.goto(link.href, {
        waitUntil: "domcontentloaded",
        timeout: CFG.pageTimeout || 20000,
      });
      await page.waitForTimeout(CFG.settleDelay || 2000);
      httpStatus = res?.status() || 0;

      const h1Count = await page.locator("h1").count();
      h1 = h1Count > 0 ? (await page.locator("h1").first().textContent()) || "" : "";
      h1 = h1.trim().slice(0, 60);

      const tableCount = await page.locator("table").count();
      const buttonCount = await page.locator("button").count();

      const emptyMarkers = CFG.emptyStateMarkers
        ? await page.locator(`text=/${CFG.emptyStateMarkers}/i`).count()
        : 0;
      const errorMarkers = CFG.errorMarkers
        ? await page.locator(`text=/${CFG.errorMarkers}/i`).count()
        : 0;
      const gatedMarkers = CFG.onboardingMarkers
        ? await page.locator(`text=/${CFG.onboardingMarkers}/i`).count()
        : 0;

      const bodyText = await page.locator("body").textContent();
      const bodyLen = (bodyText || "").trim().length;

      notes.push(`tables=${tableCount} buttons=${buttonCount} bodyLen=${bodyLen}`);
      if (emptyMarkers > 0) notes.push(`emptyMarkers=${emptyMarkers}`);
      if (errorMarkers > 0) {
        notes.push(`errorMarkers=${errorMarkers}`);
        status = "HAS_ERRORS";
      }
      if (gatedMarkers > 0) {
        notes.push("ONBOARDING_WALL");
        status = "GATED";
      }
      if (bodyLen < 200) {
        notes.push("suspiciously_empty");
        status = "EMPTY";
      }
      if (httpStatus >= 400) status = `HTTP_${httpStatus}`;

      await page.screenshot({ path: screenshot, fullPage: true });
    } catch (err) {
      status = "CRASHED";
      notes.push(`error: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`);
      try {
        await page.screenshot({ path: screenshot, fullPage: false });
      } catch {
        // ignore screenshot failure
      }
    }

    findings.push({
      page: link.name,
      href: link.href,
      status,
      httpStatus,
      h1,
      notes,
      screenshot,
    });

    console.log(
      `[${status.padEnd(14)}] ${link.name.padEnd(28)} ${link.href}${h1 ? ` — h1="${h1}"` : ""}`
    );
    for (const n of notes) console.log(`    └─ ${n}`);
  }

  console.log(`\n${bar}`);
  console.log(`  SUMMARY`);
  console.log(`${bar}\n`);
  const byStatus: Record<string, number> = {};
  for (const f of findings) byStatus[f.status] = (byStatus[f.status] || 0) + 1;
  for (const [s, n] of Object.entries(byStatus)) {
    console.log(`  ${s.padEnd(14)} ${n} page(s)`);
  }

  const reportPath = path.join(RESULTS_DIR, "report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        project: CFG.name,
        baseUrl: CFG.baseUrl,
        timestamp: new Date().toISOString(),
        totals: byStatus,
        findings,
      },
      null,
      2
    )
  );
  console.log(`\n  JSON report: ${reportPath}`);
  console.log(`  Screenshots: ${path.join(RESULTS_DIR, "screenshots/")}\n`);

  expect(findings.length).toBe(CFG.navLinks.length);
  await ctx.close();
});
