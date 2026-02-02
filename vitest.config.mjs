import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.mjs', 'test/**/*.perf.mjs'],
    exclude: [
      'test/e2e/**',
      // Playwright-based performance tests (run with npm run test:perf:docker)
      'test/perf/progressive-loading.perf.mjs',
      'test/perf/phase-timing.perf.mjs'
    ],
    testTimeout: 30000
  }
});
