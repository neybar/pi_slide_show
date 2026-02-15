import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.mjs', 'test/**/*.perf.mjs'],
    exclude: [
      'test/e2e/**',
      // Playwright-based performance tests (run with npm run test:perf:docker)
      'test/perf/progressive-loading.perf.mjs',
      'test/perf/phase-timing.perf.mjs',
      'test/perf/compare-prod.perf.mjs',
      'test/perf/album-lookup.perf.mjs',
      'test/perf/loading-by-year.perf.mjs'
    ],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['lib/**/*.mjs', 'www/js/**/*.mjs'],
      exclude: [
        'test/**',
        'node_modules/**',
        'www/js/vendor/**',
        '**/*.config.mjs'
      ],
      thresholds: {
        lines: 70,
        branches: 59,
        functions: 70,
        statements: 70
      }
    }
  }
});
