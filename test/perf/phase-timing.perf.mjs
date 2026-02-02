/**
 * Phase Timing Performance Tests
 *
 * Measures time spent in each phase of progressive image loading:
 * - Phase 1: /album API call
 * - Phase 2: Initial thumbnail loading (M quality)
 * - Phase 3: Upgrade to XL quality
 *
 * Results are saved to test-results/perf-history.json for tracking over time.
 *
 * Run with: npm run test:perf:docker
 */

import { test, expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Use dedicated perf-results directory (not test-results which Playwright cleans on failure)
const RESULTS_DIR = join(__dirname, '../../perf-results');
const HISTORY_FILE = join(RESULTS_DIR, 'perf-history.json');

// Base URL for Docker container
const DOCKER_URL = process.env.DOCKER_URL || 'http://localhost:3000';

// Timeout constants
const TIMEOUTS = {
  PREREQUISITE_CHECK: 5000,
  PHASE_ONE: 10000,      // /album API call
  PHASE_TWO: 60000,      // Initial thumbnail loading
  PHASE_THREE: 90000,    // XL upgrade
};

/**
 * Load existing performance history
 */
async function loadHistory() {
  try {
    const data = await fs.readFile(HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { runs: [] };
  }
}

/**
 * Get current git commit hash
 */
function getGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return process.env.GIT_COMMIT || 'unknown';
  }
}

/**
 * Save performance result to history
 */
async function saveToHistory(result) {
  await fs.mkdir(RESULTS_DIR, { recursive: true });

  const history = await loadHistory();

  // Add new result
  history.runs.push({
    timestamp: new Date().toISOString(),
    gitCommit: getGitCommit(),
    ...result,
  });

  // Keep last 50 runs
  if (history.runs.length > 50) {
    history.runs = history.runs.slice(-50);
  }

  await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
}

/**
 * Get statistics from recent runs
 */
function getStats(history, metric, count = 5) {
  const values = history.runs
    .slice(-count)
    .map(r => r[metric])
    .filter(v => typeof v === 'number');

  if (values.length === 0) return null;

  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);

  return { avg: Math.round(avg), min, max, count: values.length };
}

/**
 * Check if Docker container is running
 */
async function checkPrerequisites(page) {
  try {
    const response = await page.request.get(`${DOCKER_URL}/album/1`, {
      timeout: TIMEOUTS.PREREQUISITE_CHECK
    });
    if (!response.ok()) {
      return { ready: false, reason: `Server returned ${response.status()}` };
    }
    const album = await response.json();
    if (!album.images || album.images.length === 0) {
      return { ready: false, reason: 'No images in album response' };
    }
    return { ready: true };
  } catch (error) {
    return { ready: false, reason: error.message };
  }
}

test.describe('Phase Timing Performance Tests', () => {
  // Skip in CI
  test.skip(() => !!process.env.CI, 'Docker perf tests are local-only');

  test.beforeEach(async ({ page }) => {
    const prereq = await checkPrerequisites(page);
    test.skip(!prereq.ready, `Prerequisites not met: ${prereq.reason}`);
  });

  /**
   * Main test: Measure all three phases
   */
  test('Measure Phase Timings', async ({ page }) => {
    test.setTimeout(TIMEOUTS.PHASE_ONE + TIMEOUTS.PHASE_TWO + TIMEOUTS.PHASE_THREE + 30000);

    const timings = {
      phase1_album_api: 0,
      phase2_initial_thumbnails: 0,
      phase3_xl_upgrade: 0,
      total_time: 0,
      photo_count: 0,
      thumb_m_count: 0,
      thumb_xl_count: 0,
      thumb_m_bytes: 0,
      thumb_xl_bytes: 0,
    };

    let albumCallStart = 0;
    let albumCallEnd = 0;
    let allThumbsLoaded = 0;
    let allUpgradesComplete = 0;

    // Intercept /album API call to measure timing
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/album/')) {
        albumCallStart = Date.now();
      }
    });

    page.on('response', async (response) => {
      const url = response.url();

      // Track /album API response time
      if (url.includes('/album/') && response.ok()) {
        albumCallEnd = Date.now();
        try {
          const data = await response.json();
          timings.photo_count = data.images?.length || 0;
        } catch {
          // Ignore JSON parse errors
        }
      }

      // Track thumbnail loads
      if (url.includes('/photos/') && response.ok()) {
        const contentLength = parseInt(response.headers()['content-length'] || '0', 10);

        if (url.includes('SYNOPHOTO_THUMB_M')) {
          timings.thumb_m_count++;
          timings.thumb_m_bytes += contentLength;
        } else if (url.includes('SYNOPHOTO_THUMB_XL')) {
          timings.thumb_xl_count++;
          timings.thumb_xl_bytes += contentLength;
        }
      }
    });

    const startTime = Date.now();

    // Navigate to page
    await page.goto(DOCKER_URL, { waitUntil: 'domcontentloaded' });

    // Phase 1: Wait for /album API to complete
    await page.waitForFunction(
      () => window.albumLoaded === true || document.querySelectorAll('#photo_store .img_box').length > 0,
      { timeout: TIMEOUTS.PHASE_ONE }
    ).catch(() => {
      // Album may load before we can catch it, that's OK
    });

    // Calculate Phase 1 timing
    if (albumCallStart > 0 && albumCallEnd > 0) {
      timings.phase1_album_api = albumCallEnd - albumCallStart;
    }

    // Phase 2: Wait for initial thumbnails to load and display in rows
    // Photos are preloaded then moved to #top_row and #bottom_row
    await page.waitForFunction(
      () => {
        const photos = document.querySelectorAll('#top_row .photo img, #bottom_row .photo img');
        if (photos.length < 5) return false; // Need multiple photos displayed

        // Check that photos are actually loaded (not just DOM elements)
        let loadedCount = 0;
        photos.forEach(img => {
          if (img.naturalWidth > 0) loadedCount++;
        });
        return loadedCount >= 5;
      },
      { timeout: TIMEOUTS.PHASE_TWO }
    );

    allThumbsLoaded = Date.now();
    timings.phase2_initial_thumbnails = allThumbsLoaded - (albumCallEnd || startTime);

    // Phase 3: Wait for XL upgrades to complete
    // Track XL requests - wait until we've received at least 15 XL thumbnails
    // or until no new XL requests for 3 seconds (upgrades complete/failed)
    let lastXlCount = 0;
    let stableCount = 0;
    const xlTargetCount = Math.min(timings.thumb_m_count, 20); // Expect similar count to M thumbs

    while (stableCount < 3) {
      await page.waitForTimeout(1000);

      if (timings.thumb_xl_count >= xlTargetCount) {
        // Reached target count
        break;
      }

      if (timings.thumb_xl_count === lastXlCount) {
        stableCount++;
      } else {
        stableCount = 0;
        lastXlCount = timings.thumb_xl_count;
      }

      // Safety timeout - don't wait forever
      if (Date.now() - allThumbsLoaded > TIMEOUTS.PHASE_THREE) {
        break;
      }
    }

    allUpgradesComplete = Date.now();
    timings.phase3_xl_upgrade = allUpgradesComplete - allThumbsLoaded;
    timings.total_time = allUpgradesComplete - startTime;

    // Print results
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║                    Phase Timing Results                             ║');
    console.log('╠════════════════════════════════════════════════════════════════════╣');
    console.log(`║ Phase 1: /album API call         ${String(timings.phase1_album_api).padStart(6)}ms                        ║`);
    console.log(`║ Phase 2: Initial thumbs (M)      ${String(timings.phase2_initial_thumbnails).padStart(6)}ms  (${timings.thumb_m_count} images, ${(timings.thumb_m_bytes / 1024).toFixed(0)}KB) ║`);
    console.log(`║ Phase 3: Upgrade to XL           ${String(timings.phase3_xl_upgrade).padStart(6)}ms  (${timings.thumb_xl_count} images, ${(timings.thumb_xl_bytes / 1024).toFixed(0)}KB) ║`);
    console.log('╠════════════════════════════════════════════════════════════════════╣');
    console.log(`║ TOTAL                            ${String(timings.total_time).padStart(6)}ms                        ║`);
    console.log('╚════════════════════════════════════════════════════════════════════╝');

    // Save to history
    await saveToHistory(timings);

    // Load history and show comparison
    const history = await loadHistory();
    if (history.runs.length > 1) {
      console.log('\n╔════════════════════════════════════════════════════════════════════╗');
      console.log('║                    Historical Comparison (last 5 runs)             ║');
      console.log('╠════════════════════════════════════════════════════════════════════╣');

      const p1Stats = getStats(history, 'phase1_album_api');
      const p2Stats = getStats(history, 'phase2_initial_thumbnails');
      const p3Stats = getStats(history, 'phase3_xl_upgrade');
      const totalStats = getStats(history, 'total_time');

      if (p1Stats) {
        console.log(`║ Phase 1 avg: ${String(p1Stats.avg).padStart(6)}ms  (min: ${String(p1Stats.min).padStart(5)}, max: ${String(p1Stats.max).padStart(5)})              ║`);
      }
      if (p2Stats) {
        console.log(`║ Phase 2 avg: ${String(p2Stats.avg).padStart(6)}ms  (min: ${String(p2Stats.min).padStart(5)}, max: ${String(p2Stats.max).padStart(5)})              ║`);
      }
      if (p3Stats) {
        console.log(`║ Phase 3 avg: ${String(p3Stats.avg).padStart(6)}ms  (min: ${String(p3Stats.min).padStart(5)}, max: ${String(p3Stats.max).padStart(5)})              ║`);
      }
      if (totalStats) {
        console.log(`║ Total avg:   ${String(totalStats.avg).padStart(6)}ms  (min: ${String(totalStats.min).padStart(5)}, max: ${String(totalStats.max).padStart(5)})              ║`);
      }

      // Show trend
      const prevRun = history.runs[history.runs.length - 2];
      const currRun = history.runs[history.runs.length - 1];
      const totalDiff = currRun.total_time - prevRun.total_time;
      const trend = totalDiff > 100 ? '📈 SLOWER' : totalDiff < -100 ? '📉 FASTER' : '➡️  STABLE';

      console.log('╠════════════════════════════════════════════════════════════════════╣');
      console.log(`║ Trend vs previous run: ${trend} (${totalDiff > 0 ? '+' : ''}${totalDiff}ms)                      ║`);
      console.log('╚════════════════════════════════════════════════════════════════════╝');
    }

    console.log(`\n📁 Results saved to: ${HISTORY_FILE}\n`);

    // Assertions
    expect(timings.phase1_album_api).toBeLessThan(5000);
    expect(timings.phase2_initial_thumbnails).toBeLessThan(30000);
    expect(timings.total_time).toBeLessThan(90000);
  });

  /**
   * Test: Just /album API latency
   */
  test('Album API Latency', async ({ page }) => {
    test.setTimeout(TIMEOUTS.PHASE_ONE * 5 + 10000);

    const iterations = 5;
    const latencies = [];
    let failures = 0;

    for (let i = 0; i < iterations; i++) {
      // Small delay between requests to avoid rate limiting
      if (i > 0) await page.waitForTimeout(500);

      const start = Date.now();
      const response = await page.request.get(`${DOCKER_URL}/album/25`, {
        timeout: TIMEOUTS.PHASE_ONE
      });
      const latency = Date.now() - start;

      if (response.ok()) {
        latencies.push(latency);
      } else {
        failures++;
      }
    }

    // Need at least 2 successful requests to compute meaningful stats
    expect(latencies.length).toBeGreaterThanOrEqual(2);

    const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    const min = Math.min(...latencies);
    const max = Math.max(...latencies);

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║                    /album API Latency Test                         ║');
    console.log('╠════════════════════════════════════════════════════════════════════╣');
    console.log(`║ Successful: ${latencies.length}/${iterations}                                                    ║`);
    console.log(`║ Average:    ${String(avg).padStart(6)}ms                                            ║`);
    console.log(`║ Min:        ${String(min).padStart(6)}ms                                            ║`);
    console.log(`║ Max:        ${String(max).padStart(6)}ms                                            ║`);
    console.log(`║ All runs:   [${latencies.join(', ')}]ms                     ║`);
    console.log('╚════════════════════════════════════════════════════════════════════╝');
    console.log('\n');

    expect(avg).toBeLessThan(2000);
  });
});
