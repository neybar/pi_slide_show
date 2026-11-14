/**
 * E2E layout invariants for the grid-sized scenario albums (full-panorama,
 * full-no-panorama, partial-12), served by the real server through the
 * test-only /album/scenario/:name route (see helpers/scenario.mjs).
 */
import { test, expect } from '@playwright/test';
import { useScenario } from './helpers/scenario.mjs';
import { overrideConfig } from './helpers/config-override.mjs';
import { assertRowsFilled, readRows, waitForRowsSettled } from './helpers/grid-invariants.mjs';

test.use({ viewport: { width: 1920, height: 1080 } });

// The scenario route is test-only. Skip (rather than fail) when the target
// server doesn't serve it, e.g. BASE_URL pointing at a production/docker build
// whose library lacks scenarios/. Runs against any server that has them.
test.beforeAll(async ({ request }) => {
  const res = await request.get('/album/scenario/full-panorama');
  test.skip(res.status() === 404, 'Scenario route/fixtures not available on this server');
});

async function openScenario(page, name, config) {
  if (config) await overrideConfig(page, config);
  await useScenario(page, name);
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/(^|\s)mode-grid(\s|$)/, { timeout: 15000 });
  await page.waitForFunction(
    () => document.querySelectorAll('#top_row .photo, #bottom_row .photo').length > 0,
    { timeout: 15000 }
  );
  await waitForRowsSettled(page);
  await assertRowsFilled(page);
  await expect(page.locator('#hero_stage')).toBeHidden();
}

// Columns a .photo spans, from the same data attribute the layout code writes.
const spans = (page, selector) =>
  page.locator(selector).evaluateAll((els) => els.map((el) => $(el).data('columns')));

test.describe('Grid scenarios', () => {
  test('full-panorama: grid mode, rows filled, panorama spans 2..N-1 columns', async ({ page }) => {
    // Make panorama placement deterministic instead of a coin flip per row
    await openScenario(page, 'full-panorama', { PANORAMA_USE_PROBABILITY: 1 });

    const pano = page.locator('#top_row .panorama-container, #bottom_row .panorama-container');
    await expect(pano.first()).toBeVisible({ timeout: 15000 });
    const total = (await readRows(page)).columnCount;
    for (const columns of await spans(page, '.panorama-container')) {
      expect(columns).toBeGreaterThanOrEqual(2);
      expect(columns).toBeLessThanOrEqual(total - 1);
    }
  });

  test('full-no-panorama: grid mode, rows filled, no extra-wide photo', async ({ page }) => {
    await openScenario(page, 'full-no-panorama');

    await expect(page.locator('.panorama-container')).toHaveCount(0);
    // Landscapes span at most 2 columns; nothing panorama-wide (3+)
    for (const columns of await spans(page, '#top_row .photo, #bottom_row .photo')) {
      expect(columns).toBeGreaterThanOrEqual(1);
      expect(columns).toBeLessThanOrEqual(2);
    }
  });

  test('partial-12: grid mode (above TINY_ALBUM_MAX), rows filled, no blanks from clones', async ({ page }) => {
    await openScenario(page, 'partial-12');
    const { rows } = await readRows(page);
    expect(Object.values(rows).every((r) => r.photoCount > 0 && r.unloaded === 0)).toBe(true);
  });

  test('default /album/35 never returns a scenarios/ photo', async ({ request }) => {
    for (let i = 0; i < 20; i++) {
      const res = await request.get('/album/35');
      expect(res.ok()).toBe(true);
      const { images } = await res.json();
      for (const img of images) expect(img.file).not.toContain('/scenarios/');
    }
  });
});
