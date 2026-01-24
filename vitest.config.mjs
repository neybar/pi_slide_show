import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.mjs', 'test/**/*.perf.mjs'],
    exclude: ['test/e2e/**'],
    testTimeout: 30000
  }
});
