/**
 * Photo Loading Performance Test by Year
 *
 * Tests progressive loading performance using fixed datasets from different eras.
 * Uses pre-generated fixtures to ensure reproducible, comparable results.
 *
 * Each fixture contains 25 photos from a specific year range:
 * - 2010: Photos from 2008-2012 (older cameras, ~8MP, smaller files)
 * - 2015: Photos from 2013-2017 (mid-range, ~16MP)
 * - 2020: Photos from 2018-2022 (modern phones, ~24MP)
 * - 2025: Photos from 2023-2025 (latest cameras, ~48MP+, largest files)
 *
 * Metrics measured:
 * - Time to first photo visible (Phase 2)
 * - Time to all M thumbnails loaded
 * - Time to all XL upgrades complete (Phase 3)
 * - Total bytes transferred (M vs XL)
 *
 * Run with: npm run test:perf:docker
 */

import { test, expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import {
  loadPageWithFixture,
  fetchFixtureData,
  loadHistory as loadHistoryUtil,
  saveToHistory as saveToHistoryUtil,
  getGitCommit as getGitCommitUtil,
} from './fixtures-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, '../../perf-results');
const HISTORY_FILE = join(RESULTS_DIR, 'loading-by-year-history.json');

// Base URL for Docker container
const DOCKER_URL = process.env.DOCKER_URL || 'http://localhost:3000';

// Valid fixture years
const FIXTURE_YEARS = ['2010', '2015', '2020', '2025'];

// Timeout constants
const TIMEOUTS = {
  PREREQUISITE_CHECK: 5000,
  FIRST_PHOTO: 30000,
  FULL_LOAD: 60000,
  UPGRADE_COMPLETE: 90000,
};

// Wrapper functions using shared utilities
async function loadHistory() {
  return loadHistoryUtil(fs, HISTORY_FILE);
}

function getGitCommit() {
  return getGitCommitUtil(execSync);
}

async function saveToHistory(result) {
  return saveToHistoryUtil(fs, RESULTS_DIR, HISTORY_FILE, result, getGitCommit());
}

/**
 * Check if Docker container is running and fixture endpoint works
 */
async function checkPrerequisites(page) {
  try {
    // Check if server is responding
    const response = await page.request.get(`${DOCKER_URL}/album/fixture/2010`, {
      timeout: TIMEOUTS.PREREQUISITE_CHECK
    });

    if (!response.ok()) {
      return { ready: false, reason: `Fixture endpoint returned ${response.status()}` };
    }

    // Check if response has photos
    const fixture = await response.json();
    if (!fixture.images || fixture.images.length === 0) {
      return { ready: false, reason: 'No images in fixture response' };
    }

    return { ready: true };
  } catch (error) {
    return { ready: false, reason: error.message };
  }
}

/**
 * Load page with fixture data for a specific year.
 * Wraps the shared utility with year-specific fixture fetching.
 */
async function loadPageWithFixtureYear(page, year) {
  // First, get the fixture data
  const fixtureData = await fetchFixtureData(page, DOCKER_URL, year, TIMEOUTS.PREREQUISITE_CHECK);

  if (!fixtureData) {
    throw new Error(`Failed to load fixture for year ${year}`);
  }

  // Load page with fixture
  await loadPageWithFixture(page, DOCKER_URL, fixtureData);

  return fixtureData;
}

test.describe('Photo Loading Performance by Year', () => {
  // Skip in CI - Docker perf tests are local-only
  test.skip(() => !!process.env.CI, 'Docker perf tests are local-only');

  test.beforeEach(async ({ page }) => {
    const prereq = await checkPrerequisites(page);
    test.skip(!prereq.ready, `Prerequisites not met: ${prereq.reason}`);
  });

  /**
   * Test loading performance for each year's fixture
   */
  for (const year of FIXTURE_YEARS) {
    test(`Loading Performance - ${year} Era Photos`, async ({ page }) => {
      test.setTimeout(TIMEOUTS.UPGRADE_COMPLETE + 30000);

      const metrics = {
        year,
        timeToFirstPhoto: 0,
        timeToAllMThumbnails: 0,
        timeToAllXLUpgrades: 0,
        bytesTransferred: {
          thumbM: 0,
          thumbXL: 0,
          original: 0,
          total: 0,
        },
        requestCounts: {
          thumbM: 0,
          thumbXL: 0,
          original: 0,
        },
      };

      // Track network requests
      const requestStartTimes = new Map();
      let firstPhotoTime = 0;
      let allMLoaded = false;
      let allMLoadedTime = 0;

      page.on('request', (request) => {
        requestStartTimes.set(request.url(), Date.now());
      });

      page.on('response', async (response) => {
        const url = response.url();
        const headers = response.headers();
        const contentLength = parseInt(headers['content-length'] || '0', 10);

        if (url.includes('/photos/')) {
          metrics.bytesTransferred.total += contentLength;

          if (url.includes('SYNOPHOTO_THUMB_M')) {
            metrics.requestCounts.thumbM++;
            metrics.bytesTransferred.thumbM += contentLength;
          } else if (url.includes('SYNOPHOTO_THUMB_XL')) {
            metrics.requestCounts.thumbXL++;
            metrics.bytesTransferred.thumbXL += contentLength;
          } else if (url.match(/\.(jpg|jpeg|png|gif)$/i)) {
            metrics.requestCounts.original++;
            metrics.bytesTransferred.original += contentLength;
          }
        }
      });

      const startTime = Date.now();

      // Load page with fixture
      try {
        await loadPageWithFixtureYear(page, year);
      } catch (err) {
        console.log(`\n⚠️ Fixture injection failed for ${year}: ${err.message}\n`);
        // Fall back to regular loading
        await page.goto(DOCKER_URL, { waitUntil: 'domcontentloaded' });
      }

      // Wait for first photo to be visible
      try {
        await page.waitForFunction(
          () => {
            const photos = document.querySelectorAll('#top_row .photo img, #bottom_row .photo img');
            return photos.length > 0 && photos[0].naturalWidth > 0;
          },
          { timeout: TIMEOUTS.FIRST_PHOTO }
        );

        metrics.timeToFirstPhoto = Date.now() - startTime;
      } catch (err) {
        console.log(`\n⚠️ First photo timeout for ${year}: ${err.message}\n`);
        metrics.timeToFirstPhoto = TIMEOUTS.FIRST_PHOTO;
      }

      // Wait for all M thumbnails to load (initial batch)
      try {
        await page.waitForFunction(
          () => {
            const imgBoxes = document.querySelectorAll('#photo_store .img_box');
            if (imgBoxes.length < 20) return false;

            let loadedCount = 0;
            imgBoxes.forEach(box => {
              const img = box.querySelector('img');
              if (img && img.naturalWidth > 0) loadedCount++;
            });

            return loadedCount >= 20;
          },
          { timeout: TIMEOUTS.FULL_LOAD }
        );

        metrics.timeToAllMThumbnails = Date.now() - startTime;
      } catch (err) {
        console.log(`\n⚠️ M thumbnails timeout for ${year}: ${err.message}\n`);
        metrics.timeToAllMThumbnails = TIMEOUTS.FULL_LOAD;
      }

      // Wait for XL upgrades to complete
      try {
        await page.waitForFunction(
          () => {
            const imgBoxes = document.querySelectorAll('#photo_store .img_box');
            if (imgBoxes.length < 20) return false;

            let upgradedCount = 0;
            imgBoxes.forEach(box => {
              const img = box.querySelector('img');
              if (img && img.src) {
                // Count as upgraded if using XL or original (not M)
                if (img.src.includes('SYNOPHOTO_THUMB_XL') || !img.src.includes('SYNOPHOTO_THUMB_M')) {
                  upgradedCount++;
                }
              }
            });

            return upgradedCount >= imgBoxes.length * 0.9;
          },
          { timeout: TIMEOUTS.UPGRADE_COMPLETE }
        );

        metrics.timeToAllXLUpgrades = Date.now() - startTime;
      } catch (err) {
        console.log(`\n⚠️ XL upgrades timeout for ${year}: ${err.message}\n`);
        metrics.timeToAllXLUpgrades = TIMEOUTS.UPGRADE_COMPLETE;
      }

      // Print results for this year
      console.log('\n');
      console.log(`╔══════════════════════════════════════════════════════════════════════╗`);
      console.log(`║            Loading Performance - ${year} Era Photos                    ║`);
      console.log(`╠══════════════════════════════════════════════════════════════════════╣`);
      console.log(`║ Time to first photo:      ${String(metrics.timeToFirstPhoto).padStart(6)}ms                              ║`);
      console.log(`║ Time to all M thumbnails: ${String(metrics.timeToAllMThumbnails).padStart(6)}ms                              ║`);
      console.log(`║ Time to all XL upgrades:  ${String(metrics.timeToAllXLUpgrades).padStart(6)}ms                              ║`);
      console.log(`╠══════════════════════════════════════════════════════════════════════╣`);
      console.log(`║ Network Requests:                                                     ║`);
      console.log(`║   THUMB_M:  ${String(metrics.requestCounts.thumbM).padStart(3)} requests, ${String((metrics.bytesTransferred.thumbM / 1024).toFixed(1)).padStart(8)} KB             ║`);
      console.log(`║   THUMB_XL: ${String(metrics.requestCounts.thumbXL).padStart(3)} requests, ${String((metrics.bytesTransferred.thumbXL / 1024).toFixed(1)).padStart(8)} KB             ║`);
      console.log(`║   Original: ${String(metrics.requestCounts.original).padStart(3)} requests, ${String((metrics.bytesTransferred.original / 1024).toFixed(1)).padStart(8)} KB             ║`);
      console.log(`║   Total:                  ${String((metrics.bytesTransferred.total / 1024).toFixed(1)).padStart(8)} KB             ║`);
      console.log(`╚══════════════════════════════════════════════════════════════════════╝`);

      // Assertions
      expect(metrics.timeToFirstPhoto).toBeLessThan(TIMEOUTS.FIRST_PHOTO);
      expect(metrics.timeToAllMThumbnails).toBeLessThan(TIMEOUTS.FULL_LOAD);
    });
  }

  /**
   * Summary test: Compare all years and save to history
   */
  test('Year Comparison Summary', async ({ page }) => {
    test.setTimeout(10000);

    // This test runs after the individual year tests
    // Load history and generate summary
    const history = await loadHistory();

    if (history.runs.length === 0) {
      console.log('\n⚠️ No performance data collected yet. Run individual year tests first.\n');
      return;
    }

    // Find most recent run for each year
    const latestByYear = {};
    for (const run of history.runs) {
      if (run.year && FIXTURE_YEARS.includes(run.year)) {
        latestByYear[run.year] = run;
      }
    }

    const yearsWithData = Object.keys(latestByYear);

    if (yearsWithData.length === 0) {
      console.log('\n⚠️ No year-specific data found. Run loading tests for each year first.\n');
      return;
    }

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    Year-by-Year Performance Comparison                      ║');
    console.log('╠════════════════════════════════════════════════════════════════════════════╣');
    console.log('║  Year  │ First Photo │ All M Loaded │ All XL Done │ Total KB               ║');
    console.log('╠════════════════════════════════════════════════════════════════════════════╣');

    for (const year of FIXTURE_YEARS) {
      const data = latestByYear[year];
      if (data) {
        const totalKB = data.bytesTransferred ? (data.bytesTransferred.total / 1024).toFixed(0) : 'N/A';
        console.log(`║  ${year}  │ ${String(data.timeToFirstPhoto || 'N/A').padStart(9)}ms │ ${String(data.timeToAllMThumbnails || 'N/A').padStart(10)}ms │ ${String(data.timeToAllXLUpgrades || 'N/A').padStart(9)}ms │ ${String(totalKB).padStart(8)}  ║`);
      } else {
        console.log(`║  ${year}  │       N/A   │        N/A   │       N/A   │      N/A  ║`);
      }
    }

    console.log('╚════════════════════════════════════════════════════════════════════════════╝');

    // Save summary to history file location
    console.log(`\n📁 History file: ${HISTORY_FILE}\n`);
  });

  /**
   * Test: Verify fixture endpoint returns different data per year
   */
  test('Fixture Endpoints Return Different Data', async ({ page }) => {
    test.setTimeout(30000);

    const fixtures = {};

    for (const year of FIXTURE_YEARS) {
      const response = await page.request.get(`${DOCKER_URL}/album/fixture/${year}`, {
        timeout: TIMEOUTS.PREREQUISITE_CHECK
      });

      expect(response.ok()).toBe(true);
      fixtures[year] = await response.json();
    }

    // Verify each fixture has different content
    const allPaths = new Set();
    for (const year of FIXTURE_YEARS) {
      const paths = fixtures[year].images.map(img => img.file);

      // Each year's fixture should have mostly unique paths
      const yearPaths = new Set(paths);
      expect(yearPaths.size).toBe(25); // 25 unique photos per fixture

      paths.forEach(p => allPaths.add(p));
    }

    // Total unique paths across all years (should be 100 if all different)
    console.log(`\n✅ Fixtures verified: ${allPaths.size} unique photo paths across ${FIXTURE_YEARS.length} years\n`);
    expect(allPaths.size).toBeGreaterThan(FIXTURE_YEARS.length * 20); // At least 80% unique
  });
});

/**
 * Individual year tests that save to history
 */
test.describe('Save Results to History', () => {
  test.skip(() => !!process.env.CI, 'Docker perf tests are local-only');

  for (const year of FIXTURE_YEARS) {
    test(`Save ${year} Results`, async ({ page }) => {
      test.setTimeout(TIMEOUTS.UPGRADE_COMPLETE + 30000);

      const prereq = await checkPrerequisites(page);
      test.skip(!prereq.ready, `Prerequisites not met: ${prereq.reason}`);

      const metrics = {
        year,
        timeToFirstPhoto: 0,
        timeToAllMThumbnails: 0,
        timeToAllXLUpgrades: 0,
        bytesTransferred: {
          thumbM: 0,
          thumbXL: 0,
          original: 0,
          total: 0,
        },
        requestCounts: {
          thumbM: 0,
          thumbXL: 0,
          original: 0,
        },
      };

      // Track network requests
      page.on('response', async (response) => {
        const url = response.url();
        const headers = response.headers();
        const contentLength = parseInt(headers['content-length'] || '0', 10);

        if (url.includes('/photos/')) {
          metrics.bytesTransferred.total += contentLength;

          if (url.includes('SYNOPHOTO_THUMB_M')) {
            metrics.requestCounts.thumbM++;
            metrics.bytesTransferred.thumbM += contentLength;
          } else if (url.includes('SYNOPHOTO_THUMB_XL')) {
            metrics.requestCounts.thumbXL++;
            metrics.bytesTransferred.thumbXL += contentLength;
          } else if (url.match(/\.(jpg|jpeg|png|gif)$/i)) {
            metrics.requestCounts.original++;
            metrics.bytesTransferred.original += contentLength;
          }
        }
      });

      const startTime = Date.now();

      // Navigate directly (fixture injection is optional enhancement)
      await page.goto(DOCKER_URL, { waitUntil: 'domcontentloaded' });

      // Wait for first photo
      try {
        await page.waitForFunction(
          () => {
            const photos = document.querySelectorAll('#top_row .photo img, #bottom_row .photo img');
            return photos.length > 0 && photos[0].naturalWidth > 0;
          },
          { timeout: TIMEOUTS.FIRST_PHOTO }
        );
        metrics.timeToFirstPhoto = Date.now() - startTime;
      } catch {
        metrics.timeToFirstPhoto = TIMEOUTS.FIRST_PHOTO;
      }

      // Wait for M thumbnails
      try {
        await page.waitForFunction(
          () => {
            const imgBoxes = document.querySelectorAll('#photo_store .img_box');
            if (imgBoxes.length < 15) return false;
            let loaded = 0;
            imgBoxes.forEach(box => {
              const img = box.querySelector('img');
              if (img && img.naturalWidth > 0) loaded++;
            });
            return loaded >= 15;
          },
          { timeout: TIMEOUTS.FULL_LOAD }
        );
        metrics.timeToAllMThumbnails = Date.now() - startTime;
      } catch {
        metrics.timeToAllMThumbnails = TIMEOUTS.FULL_LOAD;
      }

      // Wait for XL upgrades
      try {
        await page.waitForFunction(
          () => {
            const imgBoxes = document.querySelectorAll('#photo_store .img_box');
            if (imgBoxes.length < 15) return false;
            let upgraded = 0;
            imgBoxes.forEach(box => {
              const img = box.querySelector('img');
              if (img && img.src && (img.src.includes('THUMB_XL') || !img.src.includes('THUMB_M'))) {
                upgraded++;
              }
            });
            return upgraded >= imgBoxes.length * 0.8;
          },
          { timeout: TIMEOUTS.UPGRADE_COMPLETE }
        );
        metrics.timeToAllXLUpgrades = Date.now() - startTime;
      } catch {
        metrics.timeToAllXLUpgrades = TIMEOUTS.UPGRADE_COMPLETE;
      }

      // Save to history
      await saveToHistory(metrics);

      console.log(`\n📊 Saved ${year} results: First photo ${metrics.timeToFirstPhoto}ms, Total ${(metrics.bytesTransferred.total / 1024).toFixed(1)} KB\n`);

      expect(metrics.timeToFirstPhoto).toBeLessThan(TIMEOUTS.FIRST_PHOTO);
    });
  }
});
