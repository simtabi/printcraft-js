import { defineConfig, devices } from '@playwright/test';

// a deliberately unusual port: a common one risks binding to whatever dev
// server happens to be running, which silently tests the wrong application
const PORT = 43117;

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry'
  },
  projects: [
    // chromium only: it is the one engine that can drive print rendering and
    // page.pdf() headlessly, which is the whole point of this suite
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: {
    // served from the repo root so demo/index.html can reach ../dist/
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/demo/index.html`,
    // never reuse: with --strictPort a busy port is a loud failure, not a
    // quiet handoff to someone else's server
    reuseExistingServer: false,
    timeout: 60_000
  }
});
