import { test, expect } from '@playwright/test';
import { overrideConfig } from './helpers/config-override.mjs';

// A reload must never land on a dead server (pi_slide_show-trk): the keyboardless
// kiosk would be stuck on Chrome's error page. safeReload probes with HEAD first.

const FAST = { RELOAD_RETRY_BASE_MS: 300, RELOAD_RETRY_MAX_MS: 600, RELOAD_PROBE_TIMEOUT_MS: 1000 };

/** Answer HEAD requests for the page with `mode()`; count them. */
async function controlProbe(page, mode) {
  const state = { probes: 0 };
  await page.route('**/', async (route) => {
    if (route.request().method() !== 'HEAD') return route.continue();
    state.probes++;
    const m = mode();
    if (m === 'down') return route.abort('connectionrefused');
    if (m === '503') return route.fulfill({ status: 503, body: '' });
    return route.continue();
  });
  return state;
}

async function loadShow(page) {
  await page.goto('/');
  await page.waitForFunction(
    () => document.querySelectorAll('#top_row .photo, #bottom_row .photo').length > 0,
    { timeout: 10000 }
  );
  await page.evaluate(() => { window.__sameDocument = true; });
}

const showing = (page) => page.evaluate(
  () => document.querySelectorAll('#top_row .photo, #bottom_row .photo').length
);

test.describe('Safe reload', () => {
  test('server down: page stays, keeps showing photos, reloads once it answers', async ({ page }) => {
    test.setTimeout(30000);
    await overrideConfig(page, FAST);
    let mode = 'down';
    const state = await controlProbe(page, () => mode);
    await loadShow(page);

    await page.evaluate(() => window.SlideshowReload.request('test'));
    await expect.poll(() => state.probes, { timeout: 5000 }).toBeGreaterThanOrEqual(3);

    // Still the same document, still pending, still showing photos
    expect(await page.evaluate(() => window.__sameDocument)).toBe(true);
    expect(await page.evaluate(() => window.SlideshowReload.isPending())).toBe(true);
    expect(await showing(page)).toBeGreaterThan(0);

    // Server back: the page reloads
    mode = 'up';
    await page.waitForFunction(() => window.__sameDocument === undefined, { timeout: 10000 });
    await page.waitForFunction(
      () => document.querySelectorAll('#top_row .photo, #bottom_row .photo').length > 0
    );
  });

  test('a 5xx answer does not reload', async ({ page }) => {
    test.setTimeout(20000);
    await overrideConfig(page, FAST);
    const state = await controlProbe(page, () => '503');
    await loadShow(page);

    await page.evaluate(() => window.SlideshowReload.request('test'));
    await expect.poll(() => state.probes, { timeout: 5000 }).toBeGreaterThanOrEqual(2);
    expect(await page.evaluate(() => window.__sameDocument)).toBe(true);
    expect(await showing(page)).toBeGreaterThan(0);
  });

  test('repeated requests keep one pending probe chain', async ({ page }) => {
    test.setTimeout(20000);
    await overrideConfig(page, { ...FAST, RELOAD_RETRY_BASE_MS: 2000, RELOAD_RETRY_MAX_MS: 4000 });
    const state = await controlProbe(page, () => 'down');
    await loadShow(page);

    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) window.SlideshowReload.request('test ' + i);
    });
    await expect.poll(() => state.probes, { timeout: 5000 }).toBe(1);
    await page.waitForTimeout(500);
    expect(state.probes).toBe(1);
  });

  test('server up: the page timer reloads after probing', async ({ page }) => {
    test.setTimeout(20000);
    await overrideConfig(page, { ...FAST, PAGE_RELOAD_MS: 1500 });
    const state = await controlProbe(page, () => 'up');
    await loadShow(page);

    await page.waitForFunction(() => window.__sameDocument === undefined, { timeout: 10000 });
    expect(state.probes).toBeGreaterThanOrEqual(1);
  });

  test('meta refresh is only the 2 h last-resort net', async ({ page }) => {
    await page.goto('/');
    const content = await page.locator('meta[http-equiv="refresh"]').getAttribute('content');
    expect(Number(content)).toBeGreaterThanOrEqual(7200);
  });
});
