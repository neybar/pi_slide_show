import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Smoke tests - run with: npm run test:smoke
    // Quick deployment health checks (target: < 10 seconds)
    {
      name: 'smoke',
      testDir: './test/smoke',
      use: { ...devices['Desktop Chrome'] },
      timeout: 10000,
    },
    // Lightpanda experimental project - run with: npm run test:e2e:lightpanda
    // Requires: ./scripts/lightpanda.sh start (or --docker variant)
    // Excludes accessibility.spec.mjs — @axe-core requires a full rendering engine
    {
      name: 'lightpanda',
      testDir: './test/e2e',
      testIgnore: ['**/accessibility.spec.mjs'],
      fullyParallel: false,  // Single CDP endpoint — parallel tests would fight over the same browser
      use: {
        connectOverCDP: 'http://127.0.0.1:9222',
      },
      timeout: 60000,
    },
    // Docker performance tests - run with: npm run test:perf:docker
    // These tests are local-only (skipped in CI) and require Docker container running
    {
      name: 'docker-perf',
      testDir: './test/perf',
      // Only match Playwright-based perf tests (exclude vitest-based ones like getRandomAlbum.perf.mjs)
      testMatch: ['**/progressive-loading.perf.mjs', '**/phase-timing.perf.mjs', '**/compare-prod.perf.mjs', '**/album-lookup.perf.mjs', '**/loading-by-year.perf.mjs'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3000',  // Docker container URL
      },
      // No webServer - assumes Docker container is already running
      timeout: 120000,  // Longer timeout for performance measurements
      // Run sequentially to avoid overwhelming Docker container with parallel photo loads
      fullyParallel: false,
    },
  ],
  // Skip webServer when BASE_URL is set — assumes external server (e.g. Docker) is already running
  webServer: process.env.BASE_URL ? undefined : {
    command: 'node server.mjs',
    url: 'http://localhost:3001',
    reuseExistingServer: false,  // Always start fresh server for tests
    env: {
      PORT: '3001',
      PHOTO_LIBRARY: './test/fixtures/perf-photos',
    },
  },
});
