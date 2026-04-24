import { test, expect } from "@playwright/test";

test("debug signals UI tabs", async ({ page }) => {
  const BASE = "https://tradeinvest.knowbest.ro";
  const EMAIL = process.env.JOURNEY_EMAIL!;
  const PASSWORD = process.env.JOURNEY_PASSWORD!;

  await page.goto(`${BASE}/auth/login`);
  await page.fill('input[type=email]', EMAIL);
  await page.fill('input[type=password]', PASSWORD);
  await Promise.all([
    page.waitForURL(/\/(dashboard|simulator|settings|$)/, { timeout: 15000 }),
    page.click('button[type=submit]'),
  ]);

  // API response intercept
  const apiResponses: Array<{ url: string; status: number; body: unknown }> = [];
  page.on("response", async (res) => {
    if (res.url().includes("/api/signals")) {
      try {
        const body = await res.json();
        apiResponses.push({ url: res.url(), status: res.status(), body });
      } catch {}
    }
  });

  await page.goto(`${BASE}/signals`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // Check tab counts rendered
  const tabCountsText = await page.locator('button:has-text("pending"), button:has-text("expired"), button:has-text("all")').allInnerTexts();
  console.log("TABS:", tabCountsText);

  // Click "expired" tab
  await page.locator('button:has-text("expired")').first().click();
  await page.waitForTimeout(2000);
  const expiredBody = await page.locator("body").innerText();
  console.log("BODY SNIPPET (expired tab):", expiredBody.slice(0, 800));

  // Click "all" tab
  await page.locator('button:has-text("all")').first().click();
  await page.waitForTimeout(2000);
  const allBody = await page.locator("body").innerText();
  console.log("BODY SNIPPET (all tab):", allBody.slice(0, 800));

  console.log("\n--- API RESPONSES ---");
  for (const r of apiResponses) {
    const b = r.body as { signals?: unknown[]; counts?: unknown };
    console.log(`${r.status} ${r.url}`);
    console.log(`  signals: ${(b.signals as unknown[])?.length ?? "?"}`);
    console.log(`  counts: ${JSON.stringify(b.counts)}`);
    if ((b.signals as unknown[])?.length) {
      console.log(`  first signal: ${JSON.stringify((b.signals as unknown[])[0]).slice(0, 300)}`);
    }
  }
});
