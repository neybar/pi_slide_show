import { test, expect } from '@playwright/test';
import { overrideConfig } from './helpers/config-override.mjs';

// On-device diagnostics (pi_slide_show-6fx): with DIAG_ENABLED on the server, a page error
// shows up as a report at GET /diag. Skips when the server under test has diagnostics off.

test.describe('On-device diagnostics', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get('/diag');
    test.skip(res.status() === 404, 'server started without DIAG_ENABLED=1');
  });

  test('a page error produces a /diag report', async ({ page, request }) => {
    const marker = `diag-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await overrideConfig(page, { DIAG_INTERVAL_MS: 2000, DIAG_ERROR_MIN_GAP_MS: 100 });
    await page.goto('/');
    await expect(page.locator('meta[name="diagnostics"]')).toHaveCount(1);

    await page.evaluate((m) => { setTimeout(() => { throw new Error(m); }, 0); }, marker);

    await expect.poll(async () => {
      const data = await (await request.get('/diag')).json();
      return data.reports.some((r) => r.events.some((e) => e.type === 'error' && e.message.includes(marker)));
    }, { timeout: 10000 }).toBe(true);

    const data = await (await request.get('/diag')).json();
    const report = data.reports.find((r) => r.events.some((e) => e.message.includes(marker)));
    expect(report.reason).toBe('error');
    expect(['grid', 'single', 'tiny']).toContain(report.mode);
    expect(report.userAgent).toContain('Chrome');
    expect(report.viewport.w).toBeGreaterThan(0);
  });

  test('periodic reports carry frame timings', async ({ page, request }) => {
    await overrideConfig(page, { DIAG_INTERVAL_MS: 1500 });
    await page.goto('/');
    await expect.poll(async () => {
      const data = await (await request.get('/diag')).json();
      return data.reports.some((r) => r.reason === 'interval' && r.frames && r.frames.n > 10);
    }, { timeout: 15000 }).toBe(true);
  });
});
