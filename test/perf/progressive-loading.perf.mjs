/**
 * Docker Performance Tests for Progressive Image Loading
 *
 * These tests measure real-world progressive loading performance against
 * a Docker container with NFS-mounted photos and Synology thumbnails.
 *
 * Requirements:
 * - Docker container running (`docker compose up -d`)
 * - Photos mounted via NFS with Synology thumbnails
 * - NOT run in GitHub CI (local development only)
 *
 * Run with: npm run test:perf:docker
 */

import { test, expect } from '@playwright/test';

// Base URL for Docker container (not the test server)
const DOCKER_URL = process.env.DOCKER_URL || 'http://localhost:3000';

// Timeout constants for performance measurements
const TIMEOUTS = {
  PREREQUISITE_CHECK: 5000,     // Check if Docker is running
  FIRST_PHOTO: 30000,           // Maximum wait for first photo
  FULL_LOAD: 60000,             // Maximum wait for all photos
  UPGRADE_COMPLETE: 90000       // Maximum wait for all upgrades
};

/**
 * Helper to check if Docker container is running and thumbnails exist
 */
async function checkPrerequisites(page) {
  try {
    // Check if server is responding
    const response = await page.request.get(`${DOCKER_URL}/album/1`, {
      timeout: TIMEOUTS.PREREQUISITE_CHECK
    });

    if (!response.ok()) {
      return { ready: false, reason: `Server returned ${response.status()}` };
    }

    // Check if response has photos
    const album = await response.json();
    if (!album.images || album.images.length === 0) {
      return { ready: false, reason: 'No images in album response' };
    }

    // Try to fetch a thumbnail to verify Synology structure exists
    const photo = album.images[0];
    const thumbUrl = photo.thumb?.replace(/^\//, '') || '';
    if (thumbUrl.includes('SYNOPHOTO_THUMB_M')) {
      const thumbResponse = await page.request.get(`${DOCKER_URL}/${thumbUrl}`, {
        timeout: TIMEOUTS.PREREQUISITE_CHECK
      });
      if (!thumbResponse.ok()) {
        return { ready: false, reason: 'THUMB_M not found (thumbnails may not exist)' };
      }
    }

    return { ready: true };
  } catch (error) {
    return { ready: false, reason: error.message };
  }
}

/**
 * Performance results structure for reporting
 */
const perfResults = {
  progressiveOn: {},
  progressiveOff: {},
  comparison: {}
};

test.describe('Docker Progressive Loading Performance Tests', () => {
  // Skip all tests if running in CI
  test.skip(() => !!process.env.CI, 'Docker perf tests are local-only');

  test.beforeEach(async ({ page }) => {
    // Check prerequisites before each test
    const prereq = await checkPrerequisites(page);
    test.skip(!prereq.ready, `Prerequisites not met: ${prereq.reason}`);
  });

  /**
   * Test 1: Time to First Photo
   * Measures how quickly the first photo appears on screen.
   */
  test('Time to First Photo - Progressive ON', async ({ page }) => {
    test.setTimeout(TIMEOUTS.FIRST_PHOTO + 10000);

    const startTime = Date.now();

    // Navigate and wait for first photo
    await page.goto(DOCKER_URL, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(
      () => {
        const photos = document.querySelectorAll('#top_row .photo img, #bottom_row .photo img');
        return photos.length > 0 && photos[0].naturalWidth > 0;
      },
      { timeout: TIMEOUTS.FIRST_PHOTO }
    );

    const firstPhotoTime = Date.now() - startTime;

    console.log(`\n📊 Time to First Photo (Progressive ON): ${firstPhotoTime}ms\n`);

    perfResults.progressiveOn.timeToFirstPhoto = firstPhotoTime;

    // Progressive loading should show first photo quickly
    expect(firstPhotoTime).toBeLessThan(5000);
  });

  /**
   * Test 2: Network Bandwidth - Bytes before first photo visible
   */
  test('Network Bandwidth - Initial Load', async ({ page }) => {
    test.setTimeout(TIMEOUTS.FIRST_PHOTO + 10000);

    let bytesTransferred = 0;
    const requestsByType = {
      thumbM: { count: 0, bytes: 0 },
      thumbXL: { count: 0, bytes: 0 },
      original: { count: 0, bytes: 0 },
      other: { count: 0, bytes: 0 }
    };

    // Track all requests and their sizes
    page.on('response', async (response) => {
      try {
        const url = response.url();
        const headers = response.headers();
        const contentLength = parseInt(headers['content-length'] || '0', 10);

        if (url.includes('/photos/')) {
          bytesTransferred += contentLength;

          if (url.includes('SYNOPHOTO_THUMB_M')) {
            requestsByType.thumbM.count++;
            requestsByType.thumbM.bytes += contentLength;
          } else if (url.includes('SYNOPHOTO_THUMB_XL')) {
            requestsByType.thumbXL.count++;
            requestsByType.thumbXL.bytes += contentLength;
          } else if (url.includes('.jpg') || url.includes('.jpeg') || url.includes('.png')) {
            requestsByType.original.count++;
            requestsByType.original.bytes += contentLength;
          }
        } else {
          requestsByType.other.count++;
          requestsByType.other.bytes += contentLength;
        }
      } catch (e) {
        // Ignore errors from failed responses
      }
    });

    await page.goto(DOCKER_URL, { waitUntil: 'domcontentloaded' });

    // Wait for first photo to be visible
    await page.waitForFunction(
      () => {
        const photos = document.querySelectorAll('#top_row .photo img, #bottom_row .photo img');
        return photos.length > 0 && photos[0].naturalWidth > 0;
      },
      { timeout: TIMEOUTS.FIRST_PHOTO }
    );

    const bytesBeforeFirstPhoto = bytesTransferred;

    console.log('\n📊 Network Bandwidth Analysis:\n');
    console.log(`  THUMB_M: ${requestsByType.thumbM.count} requests, ${(requestsByType.thumbM.bytes / 1024).toFixed(1)} KB`);
    console.log(`  THUMB_XL: ${requestsByType.thumbXL.count} requests, ${(requestsByType.thumbXL.bytes / 1024).toFixed(1)} KB`);
    console.log(`  Original: ${requestsByType.original.count} requests, ${(requestsByType.original.bytes / 1024).toFixed(1)} KB`);
    console.log(`  Total before first photo: ${(bytesBeforeFirstPhoto / 1024).toFixed(1)} KB\n`);

    perfResults.progressiveOn.bytesBeforeFirstPhoto = bytesBeforeFirstPhoto;
    perfResults.progressiveOn.requestsByType = requestsByType;

    // Record for comparison
    expect(bytesTransferred).toBeGreaterThan(0);
  });

  /**
   * Test 3: Full Load Time - Time until all 25 photos are loaded
   */
  test('Full Load Time - All Photos', async ({ page }) => {
    test.setTimeout(TIMEOUTS.FULL_LOAD + 10000);

    const startTime = Date.now();

    await page.goto(DOCKER_URL, { waitUntil: 'domcontentloaded' });

    // Wait for all photos to be loaded (check photo_store has 25 items)
    await page.waitForFunction(
      () => {
        const imgBoxes = document.querySelectorAll('#photo_store .img_box');
        if (imgBoxes.length < 20) return false; // Allow slightly fewer if some fail

        // Check all images have loaded
        let loadedCount = 0;
        imgBoxes.forEach(box => {
          const img = box.querySelector('img');
          if (img && img.naturalWidth > 0) loadedCount++;
        });

        return loadedCount >= 20;
      },
      { timeout: TIMEOUTS.FULL_LOAD }
    );

    const fullLoadTime = Date.now() - startTime;

    console.log(`\n📊 Full Load Time (all photos): ${fullLoadTime}ms\n`);

    perfResults.progressiveOn.fullLoadTime = fullLoadTime;

    expect(fullLoadTime).toBeLessThan(TIMEOUTS.FULL_LOAD);
  });

  /**
   * Test 4: Upgrade Timing - Time from first photo to all upgrades complete
   */
  test('Upgrade Timing - M to XL', async ({ page }) => {
    test.setTimeout(TIMEOUTS.UPGRADE_COMPLETE + 10000);

    const timings = {
      firstPhotoVisible: 0,
      allUpgradesComplete: 0
    };

    const startTime = Date.now();

    // Track XL upgrade completions
    let xlUpgradeCount = 0;
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('SYNOPHOTO_THUMB_XL') && response.ok()) {
        xlUpgradeCount++;
      }
    });

    await page.goto(DOCKER_URL, { waitUntil: 'domcontentloaded' });

    // Wait for first photo
    await page.waitForFunction(
      () => {
        const photos = document.querySelectorAll('#top_row .photo img, #bottom_row .photo img');
        return photos.length > 0 && photos[0].naturalWidth > 0;
      },
      { timeout: TIMEOUTS.FIRST_PHOTO }
    );

    timings.firstPhotoVisible = Date.now() - startTime;

    // Wait for upgrades to complete (check quality levels)
    await page.waitForFunction(
      () => {
        const imgBoxes = document.querySelectorAll('#photo_store .img_box');
        if (imgBoxes.length < 20) return false;

        // Count photos at XL or original quality
        let upgradedCount = 0;
        imgBoxes.forEach(box => {
          const img = box.querySelector('img');
          if (img && img.src) {
            if (img.src.includes('SYNOPHOTO_THUMB_XL') || !img.src.includes('SYNOPHOTO_THUMB_M')) {
              upgradedCount++;
            }
          }
        });

        // All photos should be upgraded (or using originals)
        return upgradedCount >= imgBoxes.length * 0.9; // 90% threshold
      },
      { timeout: TIMEOUTS.UPGRADE_COMPLETE }
    );

    timings.allUpgradesComplete = Date.now() - startTime;

    const upgradeTime = timings.allUpgradesComplete - timings.firstPhotoVisible;

    console.log('\n📊 Upgrade Timing:\n');
    console.log(`  First photo visible: ${timings.firstPhotoVisible}ms`);
    console.log(`  All upgrades complete: ${timings.allUpgradesComplete}ms`);
    console.log(`  Upgrade duration: ${upgradeTime}ms`);
    console.log(`  XL requests made: ${xlUpgradeCount}\n`);

    perfResults.progressiveOn.upgradeTime = upgradeTime;
    perfResults.progressiveOn.xlUpgradeCount = xlUpgradeCount;

    // Upgrades should complete within reasonable time
    expect(timings.allUpgradesComplete).toBeLessThan(TIMEOUTS.UPGRADE_COMPLETE);
  });
});

test.describe('Performance Comparison Report', () => {
  // Skip all tests if running in CI
  test.skip(() => !!process.env.CI, 'Docker perf tests are local-only');

  /**
   * Generate a comparison report of progressive loading performance
   */
  test('Generate Performance Report', async ({ page }) => {
    // This test runs last to collect all results
    test.setTimeout(10000);

    // Check if we have results
    const hasResults = Object.keys(perfResults.progressiveOn).length > 0;

    if (!hasResults) {
      console.log('\n⚠️ No performance results collected. Run other tests first.\n');
      return;
    }

    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║           Progressive Loading Performance Report              ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');

    const on = perfResults.progressiveOn;

    if (on.timeToFirstPhoto) {
      console.log(`║ Time to First Photo:        ${String(on.timeToFirstPhoto).padStart(6)}ms                     ║`);
    }

    if (on.bytesBeforeFirstPhoto) {
      const kbBeforeFirst = (on.bytesBeforeFirstPhoto / 1024).toFixed(1);
      console.log(`║ Bytes before first photo:   ${String(kbBeforeFirst).padStart(6)} KB                    ║`);
    }

    if (on.fullLoadTime) {
      console.log(`║ Full load time:             ${String(on.fullLoadTime).padStart(6)}ms                     ║`);
    }

    if (on.upgradeTime) {
      console.log(`║ Upgrade duration (M→XL):    ${String(on.upgradeTime).padStart(6)}ms                     ║`);
    }

    if (on.requestsByType) {
      console.log('╠══════════════════════════════════════════════════════════════╣');
      console.log('║ Request Breakdown:                                            ║');
      console.log(`║   THUMB_M:  ${String(on.requestsByType.thumbM.count).padStart(3)} requests, ${String((on.requestsByType.thumbM.bytes / 1024).toFixed(1)).padStart(8)} KB         ║`);
      console.log(`║   THUMB_XL: ${String(on.requestsByType.thumbXL.count).padStart(3)} requests, ${String((on.requestsByType.thumbXL.bytes / 1024).toFixed(1)).padStart(8)} KB         ║`);
      console.log(`║   Original: ${String(on.requestsByType.original.count).padStart(3)} requests, ${String((on.requestsByType.original.bytes / 1024).toFixed(1)).padStart(8)} KB         ║`);
    }

    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║ Expected Improvements with Progressive Loading:               ║');
    console.log('║   • Time to first photo: ~9x faster (500ms vs 4500ms)        ║');
    console.log('║   • Initial bandwidth: ~90% reduction                         ║');
    console.log('║   • Total bandwidth: ~10% increase (tradeoff)                ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('\n');

    // Write results to JSON file for tracking
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const resultsDir = path.join(process.cwd(), 'test-results');
    await fs.mkdir(resultsDir, { recursive: true });

    const report = {
      timestamp: new Date().toISOString(),
      progressive: perfResults.progressiveOn,
      environment: {
        dockerUrl: DOCKER_URL,
        nodeVersion: process.version
      }
    };

    await fs.writeFile(
      path.join(resultsDir, 'perf-report.json'),
      JSON.stringify(report, null, 2)
    );

    console.log('📁 Results saved to test-results/perf-report.json\n');
  });
});
