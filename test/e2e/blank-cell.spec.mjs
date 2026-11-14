/**
 * Blank-cell guard: build_row() must insert each photo into the row as it is built,
 * so clonePhotoFromPage() can clone from earlier photos in the same row when
 * #photo_store runs dry. A grid album (server count >= 11) where most photos fail to
 * load exercises that fallback. If insertion is deferred until after the loop, the
 * top row (built first, nothing else on the page) comes up short.
 */
import { test, expect } from '@playwright/test';
import { overrideConfig } from './helpers/config-override.mjs';
import { mockAlbums, LANDSCAPE, PORTRAIT } from './helpers/mock-album.mjs';
import { waitForRowsSettled, assertRowsFilled } from './helpers/grid-invariants.mjs';

test.describe('Blank-cell guard', () => {
  test('grid row stays full when most photos fail to load', async ({ page }) => {
    await overrideConfig(page, { SWAP_INTERVAL: 600000 });
    const album = Array.from({ length: 35 }, (_, i) => (i < 3 ? PORTRAIT : LANDSCAPE));
    await mockAlbums(page, [album]);
    // Registered last, so it wins over mockAlbums: p03..p34 (originals and thumbnails) 404.
    await page.route(/Mock(%20| )Album(%20| )0\/(@eaDir\/)?p(0[3-9]|[12]\d|3[0-4])\.jpg/, (route) =>
      route.fulfill({ status: 404 }));

    await page.goto('/');
    await waitForRowsSettled(page);

    await expect(page.locator('body')).toHaveClass(/mode-grid/);
    const { rows } = await assertRowsFilled(page);
    // Only 3 photos load, so more img_boxes than that means clones were used.
    expect(rows.top_row.imgBoxCount + rows.bottom_row.imgBoxCount).toBeGreaterThan(3);
  });
});
