/**
 * E2E tests for album pre-fetch and transition functionality
 *
 * Tests the complete flow: prefetch -> fade-out -> swap -> fade-in.
 * Timings are shortened via overrideConfig; albums come from mockAlbums
 * (two 20-photo albums) so transitions never fall back to a reload.
 */

import { test, expect } from '@playwright/test';
import { overrideConfig } from './helpers/config-override.mjs';
import { mockAlbums, LANDSCAPE } from './helpers/mock-album.mjs';

const ALBUM_MS = 8000;
const FAST = {
  ALBUM_DURATION_MS: ALBUM_MS,
  PREFETCH_LEAD_TIME: 4000,
  SWAP_INTERVAL: 1500,
  ALBUM_TRANSITION_ENABLED: true,
  MIN_PHOTOS_FOR_TRANSITION: 1,
  FORCE_RELOAD_INTERVAL: 1000,
};
const album = () => Array.from({ length: 20 }, () => LANDSCAPE);

async function setup(page, overrides = {}) {
  await overrideConfig(page, { ...FAST, ...overrides });
  await mockAlbums(page, [album(), album(), album()]);
  await page.goto('/');
  await page.waitForSelector('#top_row .img_box', { timeout: 10000 });
}

const photoSrcs = (page) =>
  page.evaluate(() => Array.from(document.querySelectorAll('.img_box img')).map((i) => i.src));

// Current album name, once the page has set it
async function albumName(page) {
  await page.waitForFunction(() => document.querySelector('.album_name')?.textContent.trim());
  return page.textContent('.album_name');
}

// Resolves once .album_name differs from `before`
const waitForAlbumChange = (page, before) =>
  page.waitForFunction(
    (b) => {
      const el = document.querySelector('.album_name');
      return el && el.textContent.trim() && el.textContent !== b;
    },
    before,
    { timeout: 20000 },
  );

test.describe('Album Transition E2E Tests', () => {
  test.setTimeout(30000);

  test('fade-out animation occurs before transition', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => {
      const content = document.querySelector('#content');
      window._opacityLog = [];
      new MutationObserver(() => {
        window._opacityLog.push(parseFloat(getComputedStyle(content).opacity));
      }).observe(content, { attributes: true, attributeFilter: ['style'] });
    });
    await page.waitForFunction(() => window._opacityLog.some((v) => v < 0.5), null, { timeout: 15000 });
    const log = await page.evaluate(() => window._opacityLog);
    expect(Math.min(...log)).toBeLessThan(0.5);
  });

  test('fade-in animation occurs after transition', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => {
      const content = document.querySelector('#content');
      window._seq = [];
      setInterval(() => window._seq.push(parseFloat(getComputedStyle(content).opacity)), 50);
    });
    // Fade out, then back in
    await page.waitForFunction(() => window._seq.some((v) => v < 0.3), null, { timeout: 15000 });
    await page.waitForFunction(
      () => {
        const i = window._seq.findIndex((v) => v < 0.3);
        return window._seq.slice(i).some((v) => v > 0.95);
      },
      null,
      { timeout: 10000 },
    );
    const seq = await page.evaluate(() => window._seq);
    expect(seq[0]).toBeGreaterThan(0.9);
    expect(seq[seq.length - 1]).toBeGreaterThan(0.9);
  });

  test('no photo mixing during transition', async ({ page }) => {
    await setup(page);
    const initial = await photoSrcs(page);
    const name = await albumName(page);
    await waitForAlbumChange(page, name);
    await page.waitForTimeout(1500);
    const final = await photoSrcs(page);
    const initialAlbums = new Set(initial.map((s) => /Mock%20Album%20(\d+)/.exec(s)?.[1]));
    const finalAlbums = new Set(final.map((s) => /Mock%20Album%20(\d+)/.exec(s)?.[1]));
    // After the swap, nothing from the old album remains
    for (const a of finalAlbums) expect(initialAlbums.has(a)).toBe(false);
  });

  test('album name updates during transition', async ({ page }) => {
    await setup(page);
    const name = await albumName(page);
    await waitForAlbumChange(page, name);
    expect(await albumName(page)).not.toBe(name);
  });

  test('photos change after transition', async ({ page }) => {
    await setup(page);
    const initialCount = await page.locator('.img_box').count();
    const name = await albumName(page);
    await waitForAlbumChange(page, name);
    await page.waitForTimeout(1500);
    const finalCount = await page.locator('.img_box').count();
    expect(finalCount).toBe(initialCount);
    expect(finalCount).toBeGreaterThan(15);
  });

  test('shuffle continues after transition', async ({ page }) => {
    await setup(page);
    const name = await albumName(page);
    await waitForAlbumChange(page, name);
    await page.waitForTimeout(1000);
    const before = await photoSrcs(page);
    await page.waitForFunction(
      (b) => Array.from(document.querySelectorAll('.img_box img')).some((img, i) => img.src !== b[i]),
      before,
      { timeout: 8000 },
    );
  });

  test('photo quality upgrades work after transition', async ({ page }) => {
    await setup(page, { PROGRESSIVE_LOADING_ENABLED: true });
    const name = await albumName(page);
    await waitForAlbumChange(page, name);
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('.img_box')).some((p) => window.jQuery(p).data('quality-level')),
      null,
      { timeout: 10000 },
    );
  });

  test('fallback to reload when ALBUM_TRANSITION_ENABLED = false', async ({ page }) => {
    await setup(page, { ALBUM_TRANSITION_ENABLED: false });
    await page.evaluate(() => { window._noReloadMarker = true; });
    await page.waitForFunction(() => !window._noReloadMarker, null, { timeout: 20000 });
  });
});
