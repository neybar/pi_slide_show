import { test, expect } from '@playwright/test';
import { SWAP_INTERVAL } from '../../www/js/config.mjs';

/**
 * Memory stability E2E tests for the slideshow application.
 *
 * These tests verify that photo swaps do not leak DOM nodes, timers,
 * or photo store elements over time. Critical for the Raspberry Pi
 * deployment where the slideshow runs continuously.
 *
 * Uses DOM element counting as the primary stability metric since
 * performance.memory is Chrome-only and requires --enable-precise-memory-info
 * flag (not available by default in headless Chromium).
 *
 * Note: Photo counts can legitimately fluctuate during swaps because:
 * - Panorama photos consume 3 columns, reducing photo count in a row
 * - Stacked landscapes clone photos via clonePhotoFromPage(), adding img_boxes
 * - makeSpaceForPhoto() may remove adjacent photos to fit wider replacements
 * Tests use bounded ranges rather than strict equality to account for these.
 */
test.describe('Memory Stability E2E Tests', () => {
  /**
   * Helper: wait for the slideshow to fully initialize (photos in both rows).
   */
  const waitForSlideshow = async (page) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const topPhotos = document.querySelectorAll('#top_row .photo').length;
        const bottomPhotos = document.querySelectorAll('#bottom_row .photo').length;
        return topPhotos > 0 && bottomPhotos > 0;
      },
      { timeout: 15000 }
    );
  };

  /**
   * Helper: count all relevant DOM elements for stability tracking.
   */
  const countDomElements = async (page) => {
    return await page.evaluate(() => {
      return {
        totalNodes: document.getElementsByTagName('*').length,
        topRowPhotos: document.querySelectorAll('#top_row .photo').length,
        bottomRowPhotos: document.querySelectorAll('#bottom_row .photo').length,
        storeImgBoxes: document.querySelectorAll('#photo_store .img_box').length,
        allImages: document.querySelectorAll('img').length,
        allImgBoxes: document.querySelectorAll('.img_box').length,
      };
    });
  };

  test('DOM node count stays stable after multiple photo swaps', async ({ page }) => {
    test.setTimeout(120000);

    await waitForSlideshow(page);

    // Record baseline DOM state after initial render
    const baseline = await countDomElements(page);

    // Wait for multiple swap cycles (5 swaps)
    const swapCycles = 5;
    await page.waitForTimeout(SWAP_INTERVAL * swapCycles + 2000);

    // Record post-swap DOM state
    const afterSwaps = await countDomElements(page);

    // Total node count should not grow significantly
    // Allow 20% tolerance for cloned photos and animation elements
    const maxGrowth = Math.ceil(baseline.totalNodes * 0.2);
    expect(afterSwaps.totalNodes).toBeLessThanOrEqual(
      baseline.totalNodes + maxGrowth
    );
  });

  test('img_box count does not grow unbounded during swaps', async ({ page }) => {
    // clonePhotoFromPage() can create new img_boxes for stacked landscapes,
    // so the total count can increase slightly. Verify it stays bounded.
    test.setTimeout(90000);

    await waitForSlideshow(page);

    // Count total img_box elements (in store + in rows)
    const baseline = await page.evaluate(() => {
      return document.querySelectorAll('.img_box').length;
    });

    // Wait for 3 swap cycles
    await page.waitForTimeout(SWAP_INTERVAL * 3 + 2000);

    // Re-count
    const afterSwaps = await page.evaluate(() => {
      return document.querySelectorAll('.img_box').length;
    });

    // Allow up to 50% growth from stacked landscape clones
    // (each stacked creation adds ~2 cloned img_boxes)
    // True leak would cause unbounded growth proportional to swap count
    expect(afterSwaps).toBeLessThanOrEqual(Math.ceil(baseline * 1.5));

    // Should not lose img_boxes either (detached without re-attaching)
    expect(afterSwaps).toBeGreaterThanOrEqual(baseline - 2);
  });

  test('no detached img elements accumulate outside photo store and rows', async ({ page }) => {
    test.setTimeout(90000);

    await waitForSlideshow(page);

    // Wait for several swap cycles
    await page.waitForTimeout(SWAP_INTERVAL * 4 + 2000);

    // Check that all img_box elements are inside either #photo_store, #top_row, or #bottom_row
    const orphanedImgBoxes = await page.evaluate(() => {
      const allImgBoxes = document.querySelectorAll('.img_box');
      let orphaned = 0;
      for (const box of allImgBoxes) {
        const inStore = box.closest('#photo_store') !== null;
        const inTopRow = box.closest('#top_row') !== null;
        const inBottomRow = box.closest('#bottom_row') !== null;
        if (!inStore && !inTopRow && !inBottomRow) {
          orphaned++;
        }
      }
      return orphaned;
    });

    expect(orphanedImgBoxes).toBe(0);
  });

  test('animation timers are cleaned up between swaps', async ({ page }) => {
    test.setTimeout(90000);

    // Inject timer tracking BEFORE page load to capture all timers
    await page.addInitScript(() => {
      window.__timerTracker = {
        active: new Set(),
        maxConcurrent: 0,
      };

      const origSetTimeout = window.setTimeout;
      const origClearTimeout = window.clearTimeout;

      window.setTimeout = function(fn, delay, ...args) {
        const id = origSetTimeout.call(window, function() {
          window.__timerTracker.active.delete(id);
          if (typeof fn === 'function') {
            fn.apply(undefined, args);
          }
        }, delay);
        window.__timerTracker.active.add(id);
        const size = window.__timerTracker.active.size;
        if (size > window.__timerTracker.maxConcurrent) {
          window.__timerTracker.maxConcurrent = size;
        }
        return id;
      };

      window.clearTimeout = function(id) {
        window.__timerTracker.active.delete(id);
        return origClearTimeout.call(window, id);
      };
    });

    await waitForSlideshow(page);

    // Wait for several swap cycles to accumulate
    await page.waitForTimeout(SWAP_INTERVAL * 3 + 2000);

    const timerStats = await page.evaluate(() => ({
      activeTimers: window.__timerTracker.active.size,
      maxConcurrent: window.__timerTracker.maxConcurrent,
    }));

    // Should have at most a few active timers (shuffle timer + maybe one animation)
    // Not dozens of leaked timers
    expect(timerStats.activeTimers).toBeLessThanOrEqual(10);

    // Max concurrent should be bounded — animation phases create a few timers
    // per swap but they should resolve. Allow generous margin.
    expect(timerStats.maxConcurrent).toBeLessThanOrEqual(20);
  });

  test('row photo count stays within valid range through swap cycles', async ({ page }) => {
    // Swaps can change photo count when panoramas (3 cols) replace smaller photos
    // or when makeSpaceForPhoto removes adjacent photos. Verify the count stays
    // within a valid range and doesn't drift to zero or grow unboundedly.
    test.setTimeout(90000);

    await waitForSlideshow(page);

    const snapshots = [];
    const numSnapshots = 4;

    for (let i = 0; i < numSnapshots; i++) {
      const counts = await page.evaluate(() => ({
        topRow: document.querySelectorAll('#top_row .photo').length,
        bottomRow: document.querySelectorAll('#bottom_row .photo').length,
      }));
      snapshots.push(counts);

      if (i < numSnapshots - 1) {
        await page.waitForTimeout(SWAP_INTERVAL + 500);
      }
    }

    // Each row should always have at least 1 photo and at most 5
    // (5-column wide layout is the maximum)
    for (const snapshot of snapshots) {
      expect(snapshot.topRow).toBeGreaterThanOrEqual(1);
      expect(snapshot.topRow).toBeLessThanOrEqual(5);
      expect(snapshot.bottomRow).toBeGreaterThanOrEqual(1);
      expect(snapshot.bottomRow).toBeLessThanOrEqual(5);
    }

    // Total across both rows should stay reasonable (at least 4 photos)
    for (const snapshot of snapshots) {
      const total = snapshot.topRow + snapshot.bottomRow;
      expect(total).toBeGreaterThanOrEqual(4);
    }
  });

  test('heap size does not grow unbounded after swap cycles', async ({ page }) => {
    // Uses performance.memory API (Chrome only).
    // Skipped when API unavailable (default headless Chromium lacks
    // --enable-precise-memory-info). Run with headed browser for coverage.
    test.setTimeout(120000);

    await waitForSlideshow(page);

    // Check if performance.memory is available
    const memoryAvailable = await page.evaluate(
      () => typeof performance !== 'undefined' && performance.memory != null
    );

    if (!memoryAvailable) {
      test.skip();
      return;
    }

    // Record baseline heap size
    const baselineHeap = await page.evaluate(
      () => performance.memory.usedJSHeapSize
    );

    // Wait for multiple swap cycles
    await page.waitForTimeout(SWAP_INTERVAL * 5 + 2000);

    // Record final heap size
    const finalHeap = await page.evaluate(
      () => performance.memory.usedJSHeapSize
    );

    // Allow 50% growth tolerance (GC timing can vary)
    expect(finalHeap).toBeLessThan(baselineHeap * 1.5);
  });
});
