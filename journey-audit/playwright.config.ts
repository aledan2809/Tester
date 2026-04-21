import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /sidebar-walk\.spec\.ts/,
  retries: 0,
  reporter: [["list"]],
  timeout: 180000,
  use: { trace: "off" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
