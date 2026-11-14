import { test, expect } from '@playwright/test';
import { overrideConfig } from './helpers/config-override.mjs';
import { mockAlbums, LANDSCAPE } from './helpers/mock-album.mjs';
import {
  FILL_STAGGER_DELAY,
  SLIDE_IN_ANIMATION_DURATION,
  WATCHDOG_STUCK_GRACE_PERIOD_MS,
} from '../../www/js/config.mjs';

// The animation watchdog must run again after a seamless album transition
// (pi_slide_show-ee7): each renderer's render() starts its mode's watchdog.

const WATCHDOG_INTERVAL_MS = 500;
// Same formula as startAnimationWatchdog() in main.js (maxFillPhotos = 5)
const STUCK_THRESHOLD_MS = 4 * FILL_STAGGER_DELAY + SLIDE_IN_ANIMATION_DURATION + WATCHDOG_STUCK_GRACE_PERIOD_MS;

test.describe('Watchdog after album transition', () => {
  test('recovers a stuck-invisible cell after a transition', async ({ page }) => {
    test.setTimeout(30000);

    await overrideConfig(page, {
      ALBUM_DURATION_MS: 6000,
      PREFETCH_LEAD_TIME: 4000,
      SWAP_INTERVAL: 1000,
      MIN_PHOTOS_FOR_TRANSITION: 1,
      WATCHDOG_INTERVAL_MS,
    });
    // Two grid-sized albums, so the transition is visible as a name change
    const album = Array(16).fill(LANDSCAPE);
    await mockAlbums(page, [album, album]);

    await page.goto('/');
    await expect(page.locator('.album_name')).toHaveText('2024 Mock Album 0');
    await page.evaluate(() => { window.__sameDocument = true; });

    // Seamless transition (not a reload fallback), then wait for the fade-in to finish
    await expect(page.locator('.album_name')).toHaveText('2024 Mock Album 1', { timeout: 15000 });
    await page.waitForFunction(() => document.getElementById('content').style.opacity === '1');
    expect(await page.evaluate(() => window.__sameDocument)).toBe(true);
    await expect(page.locator('body')).toHaveClass(/(^|\s)mode-grid(\s|$)/);

    // Stop swaps (selectPhotoToReplace skips cells without display_time) so only
    // the watchdog can make the cell visible again, then hide one cell.
    await page.evaluate(() => {
      const $photos = window.$('#top_row .photo, #bottom_row .photo');
      $photos.removeData('display_time');
      const el = $photos.get(0);
      el.id = 'forced-stuck';
      el.style.opacity = '0';
      el.style.visibility = 'hidden';
    });

    // First scan marks it within one interval; the first scan past the threshold
    // recovers it. Allow one more interval plus margin for slow machines.
    await page.waitForFunction(() => {
      const el = document.getElementById('forced-stuck');
      if (!el) return false;
      const cs = getComputedStyle(el);
      return cs.visibility === 'visible' && parseFloat(cs.opacity) > 0.99;
    }, null, { timeout: 2 * WATCHDOG_INTERVAL_MS + STUCK_THRESHOLD_MS + 1000 });
  });
});
