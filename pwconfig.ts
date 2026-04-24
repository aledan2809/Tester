import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./journey-audit/tests",
  testMatch: /debug-signals\.spec\.ts/,
  retries: 0,
  reporter: [["list"]],
  timeout: 60000,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
