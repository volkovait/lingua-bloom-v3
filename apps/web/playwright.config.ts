import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "3000";
const host = process.env.PLAYWRIGHT_HOST ?? "127.0.0.1";
const baseURL = `http://${host}:${port}`;
const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    ...(storageState ? { storageState } : {})
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } }
  ],
  webServer: {
    command: `./node_modules/.bin/next dev --hostname ${host} --port ${port}`,
    cwd: __dirname,
    url: baseURL,
    reuseExistingServer: false,
    env: { ...process.env, E2E_FIXTURE_MODE: "1", NEXT_DIST_DIR: ".next-e2e" }
  }
});
