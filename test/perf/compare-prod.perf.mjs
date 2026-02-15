/**
 * Performance Comparison: Local vs Production (Fixed Dataset)
 *
 * Compares phase timings between local Docker (progressive loading)
 * and production server to measure improvements.
 *
 * IMPORTANT: Uses fixed 2020 fixture for apples-to-apples comparison.
 * Both servers must support the /album/fixture/2020 endpoint.
 *
 * Run with: npx playwright test test/perf/compare-prod.perf.mjs --project=docker-perf
 */

import { test, expect } from '@playwright/test';
import {
  loadPageWithFixture,
  checkFixtureSupport as checkFixtureSupportUtil,
} from './fixtures-utils.mjs';

const LOCAL_URL = process.env.LOCAL_URL || 'http://localhost:3000';
const PROD_URL = process.env.PROD_URL || 'http://192.168.0.6:8531';

// Standard fixture year for comparison testing
const FIXTURE_YEAR = '2020';

const TIMEOUTS = {
  PHASE_ONE: 10000,
  PHASE_TWO: 60000,
  PHASE_THREE: 90000,
};

/**
 * Check if a server supports the fixture endpoint
 */
async function checkFixtureSupport(page, serverUrl) {
  return checkFixtureSupportUtil(page, serverUrl, FIXTURE_YEAR, 5000);
}

/**
 * Measure phase timings for a given server
 * @param {Page} page - Playwright page
 * @param {string} serverUrl - Server URL
 * @param {string} serverName - Server name for logging
 * @param {object|null} fixtureData - Fixture data to inject, or null for random photos
 */
async function measurePhaseTiming(page, serverUrl, serverName, fixtureData = null) {
  const timings = {
    server: serverName,
    url: serverUrl,
    fixtureUsed: fixtureData !== null,
    phase1_album_api: 0,
    phase2_initial_display: 0,
    phase3_upgrades: 0,
    total_time: 0,
    thumb_m_count: 0,
    thumb_xl_count: 0,
    thumb_m_bytes: 0,
    thumb_xl_bytes: 0,
    original_count: 0,
  };

  let albumCallStart = 0;
  let albumCallEnd = 0;
  let allThumbsLoaded = 0;

  // Track requests
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/album/')) {
      albumCallStart = Date.now();
    }
  });

  page.on('response', async (response) => {
    const url = response.url();

    if (url.includes('/album/') && response.ok()) {
      albumCallEnd = Date.now();
    }

    if (url.includes('/photos/') && response.ok()) {
      const contentLength = parseInt(response.headers()['content-length'] || '0', 10);

      if (url.includes('SYNOPHOTO_THUMB_M')) {
        timings.thumb_m_count++;
        timings.thumb_m_bytes += contentLength;
      } else if (url.includes('SYNOPHOTO_THUMB_XL')) {
        timings.thumb_xl_count++;
        timings.thumb_xl_bytes += contentLength;
      } else if (url.match(/\.(jpg|jpeg|png|gif)$/i)) {
        timings.original_count++;
      }
    }
  });

  const startTime = Date.now();

  // Load page with fixture data if provided
  await loadPageWithFixture(page, serverUrl, fixtureData);

  // Phase 1: Wait for album API
  await page.waitForFunction(
    () => document.querySelectorAll('#photo_store .img_box').length > 0,
    { timeout: TIMEOUTS.PHASE_ONE }
  ).catch(() => {});

  if (albumCallStart > 0 && albumCallEnd > 0) {
    timings.phase1_album_api = albumCallEnd - albumCallStart;
  }

  // Phase 2: Wait for photos to display in rows
  await page.waitForFunction(
    () => {
      const photos = document.querySelectorAll('#top_row .photo img, #bottom_row .photo img');
      if (photos.length < 5) return false;
      let loaded = 0;
      photos.forEach(img => { if (img.naturalWidth > 0) loaded++; });
      return loaded >= 5;
    },
    { timeout: TIMEOUTS.PHASE_TWO }
  );

  allThumbsLoaded = Date.now();
  timings.phase2_initial_display = allThumbsLoaded - startTime;

  // Phase 3: Wait for upgrades (if any)
  let lastXlCount = 0;
  let stableCount = 0;

  while (stableCount < 3) {
    await page.waitForTimeout(1000);

    if (timings.thumb_xl_count === lastXlCount) {
      stableCount++;
    } else {
      stableCount = 0;
      lastXlCount = timings.thumb_xl_count;
    }

    if (Date.now() - allThumbsLoaded > TIMEOUTS.PHASE_THREE) {
      break;
    }
  }

  timings.phase3_upgrades = Date.now() - allThumbsLoaded;
  timings.total_time = Date.now() - startTime;

  return timings;
}

/**
 * Format bytes as human-readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * Print comparison table
 * @param {object} prod - Production timings
 * @param {object} local - Local timings
 * @param {boolean} fixedDataset - Whether fixed dataset was used
 */
function printComparison(prod, local, fixedDataset = false) {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  if (fixedDataset) {
    console.log(`║      PERFORMANCE COMPARISON: PROD vs LOCAL (Fixed ${FIXTURE_YEAR} Dataset)            ║`);
  } else {
    console.log('║              PERFORMANCE COMPARISON: PROD vs LOCAL (Random Photos)            ║');
  }
  console.log('╠═══════════════════════════════════════════════════════════════════════════════╣');
  console.log('║                                    PROD          LOCAL         IMPROVEMENT    ║');
  console.log('╠═══════════════════════════════════════════════════════════════════════════════╣');

  // Phase 1
  const p1Diff = prod.phase1_album_api - local.phase1_album_api;
  const p1Pct = prod.phase1_album_api > 0 ? ((p1Diff / prod.phase1_album_api) * 100).toFixed(0) : 0;
  console.log(`║ Phase 1: /album API         ${String(prod.phase1_album_api).padStart(6)}ms      ${String(local.phase1_album_api).padStart(6)}ms      ${p1Diff > 0 ? '↓' : '↑'} ${String(Math.abs(p1Diff)).padStart(4)}ms (${p1Pct}%)  ║`);

  // Phase 2 - This is the key metric
  const p2Diff = prod.phase2_initial_display - local.phase2_initial_display;
  const p2Pct = prod.phase2_initial_display > 0 ? ((p2Diff / prod.phase2_initial_display) * 100).toFixed(0) : 0;
  const p2Arrow = p2Diff > 0 ? '↓' : '↑';
  console.log(`║ Phase 2: Initial Display    ${String(prod.phase2_initial_display).padStart(6)}ms      ${String(local.phase2_initial_display).padStart(6)}ms      ${p2Arrow} ${String(Math.abs(p2Diff)).padStart(4)}ms (${p2Pct}%)  ║`);

  // Phase 3
  const p3Diff = prod.phase3_upgrades - local.phase3_upgrades;
  console.log(`║ Phase 3: Upgrades           ${String(prod.phase3_upgrades).padStart(6)}ms      ${String(local.phase3_upgrades).padStart(6)}ms      ${p3Diff > 0 ? '↓' : '↑'} ${String(Math.abs(p3Diff)).padStart(4)}ms        ║`);

  // Total
  const totalDiff = prod.total_time - local.total_time;
  const totalPct = prod.total_time > 0 ? ((totalDiff / prod.total_time) * 100).toFixed(0) : 0;
  console.log('╠═══════════════════════════════════════════════════════════════════════════════╣');
  console.log(`║ TOTAL TIME                  ${String(prod.total_time).padStart(6)}ms      ${String(local.total_time).padStart(6)}ms      ${totalDiff > 0 ? '↓' : '↑'} ${String(Math.abs(totalDiff)).padStart(4)}ms (${totalPct}%)  ║`);

  console.log('╠═══════════════════════════════════════════════════════════════════════════════╣');
  console.log('║ THUMBNAIL BREAKDOWN                                                           ║');
  console.log('╠═══════════════════════════════════════════════════════════════════════════════╣');
  console.log(`║ THUMB_M requests            ${String(prod.thumb_m_count).padStart(6)}         ${String(local.thumb_m_count).padStart(6)}                           ║`);
  console.log(`║ THUMB_M bytes               ${formatBytes(prod.thumb_m_bytes).padStart(8)}       ${formatBytes(local.thumb_m_bytes).padStart(8)}                         ║`);
  console.log(`║ THUMB_XL requests           ${String(prod.thumb_xl_count).padStart(6)}         ${String(local.thumb_xl_count).padStart(6)}                           ║`);
  console.log(`║ THUMB_XL bytes              ${formatBytes(prod.thumb_xl_bytes).padStart(8)}       ${formatBytes(local.thumb_xl_bytes).padStart(8)}                         ║`);
  console.log(`║ Original fallbacks          ${String(prod.original_count).padStart(6)}         ${String(local.original_count).padStart(6)}                           ║`);

  console.log('╠═══════════════════════════════════════════════════════════════════════════════╣');

  // Summary
  if (p2Diff > 500) {
    const speedup = (prod.phase2_initial_display / local.phase2_initial_display).toFixed(1);
    console.log(`║ 🚀 LOCAL IS ${speedup}x FASTER to first display! Progressive loading works!        ║`);
  } else if (p2Diff > 0) {
    console.log(`║ ✅ Local is slightly faster (${p2Diff}ms improvement)                              ║`);
  } else if (p2Diff < -500) {
    console.log(`║ ⚠️  Local is slower - investigate progressive loading                            ║`);
  } else {
    console.log(`║ ➡️  Performance is similar (within ${Math.abs(p2Diff)}ms)                                    ║`);
  }

  // Dataset note
  if (fixedDataset) {
    console.log('╠═══════════════════════════════════════════════════════════════════════════════╣');
    console.log(`║ 📌 Using fixed ${FIXTURE_YEAR} dataset for valid apples-to-apples comparison              ║`);
  } else {
    console.log('╠═══════════════════════════════════════════════════════════════════════════════╣');
    console.log('║ ⚠️  Random photos used - results may vary between servers                      ║');
  }

  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  console.log('\n');
}

test.describe('Production vs Local Performance Comparison (Fixed Dataset)', () => {
  test.skip(() => !!process.env.CI, 'Comparison tests are local-only');

  test(`Compare phase timings: PROD vs LOCAL (${FIXTURE_YEAR} fixture)`, async ({ browser }) => {
    test.setTimeout(TIMEOUTS.PHASE_ONE + TIMEOUTS.PHASE_TWO + TIMEOUTS.PHASE_THREE * 2 + 60000);

    // First, check if LOCAL server supports fixtures
    const localPage = await browser.newPage();
    const localSupportsFixtures = await checkFixtureSupport(localPage, LOCAL_URL);
    await localPage.close();

    // Get fixture data from LOCAL server (it should have the fixtures)
    let fixtureData = null;
    if (localSupportsFixtures) {
      const localFixturePage = await browser.newPage();
      try {
        const response = await localFixturePage.request.get(`${LOCAL_URL}/album/fixture/${FIXTURE_YEAR}`);
        if (response.ok()) {
          fixtureData = await response.json();
          console.log(`\n✅ Using ${FIXTURE_YEAR} fixture with ${fixtureData.images?.length || 0} photos for comparison`);
        }
      } finally {
        await localFixturePage.close();
      }
    }

    if (!fixtureData) {
      console.log('\n⚠️  Fixture endpoint not available - falling back to random photos');
      console.log('    Results may vary between PROD and LOCAL due to different photo selections\n');
    }

    // Test PROD first
    console.log('\n📊 Testing PRODUCTION server...');
    const prodPage = await browser.newPage();
    let prodTimings;
    try {
      prodTimings = await measurePhaseTiming(prodPage, PROD_URL, 'PROD', fixtureData);
      console.log(`   Phase 2 (initial display): ${prodTimings.phase2_initial_display}ms`);
      console.log(`   Fixture used: ${prodTimings.fixtureUsed ? 'Yes' : 'No (random photos)'}`);
    } finally {
      await prodPage.close();
    }

    // Small delay to avoid any rate limiting issues
    await new Promise(r => setTimeout(r, 2000));

    // Test LOCAL
    console.log('\n📊 Testing LOCAL server (progressive loading)...');
    const localTestPage = await browser.newPage();
    let localTimings;
    try {
      localTimings = await measurePhaseTiming(localTestPage, LOCAL_URL, 'LOCAL', fixtureData);
      console.log(`   Phase 2 (initial display): ${localTimings.phase2_initial_display}ms`);
      console.log(`   Fixture used: ${localTimings.fixtureUsed ? 'Yes' : 'No (random photos)'}`);
    } finally {
      await localTestPage.close();
    }

    // Print comparison
    printComparison(prodTimings, localTimings, fixtureData !== null);

    // Assertions - local should not be dramatically slower
    expect(localTimings.phase2_initial_display).toBeLessThan(prodTimings.phase2_initial_display + 5000);
  });
});
