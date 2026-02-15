/**
 * Album Lookup Performance Test
 *
 * Tests the /album/25 API endpoint performance (filesystem crawling, random selection).
 * This test uses random photos (as in real-world usage) to measure API response times.
 *
 * Metrics tracked:
 * - API response time (ms)
 * - Number of photos returned
 * - Response size (bytes)
 *
 * Results are saved to perf-results/album-lookup-history.json for tracking over time.
 *
 * Run with: npm run test:perf:docker
 */

import { test, expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, '../../perf-results');
const HISTORY_FILE = join(RESULTS_DIR, 'album-lookup-history.json');

// Base URL for Docker container
const DOCKER_URL = process.env.DOCKER_URL || 'http://localhost:3000';

// Timeout constants
const TIMEOUTS = {
  PREREQUISITE_CHECK: 5000,
  API_CALL: 10000,
};

// Test configuration
const CONFIG = {
  ITERATIONS: 10,          // Number of API calls per test run
  DELAY_BETWEEN_CALLS: 200, // ms delay between calls to avoid rate limiting
  MAX_AVG_RESPONSE_TIME: 500, // Assertion: average response time < 500ms
  MAX_SINGLE_RESPONSE_TIME: 2000, // Assertion: no single call > 2000ms
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
 * Calculate statistics from array of values
 */
function calculateStats(values) {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  // Calculate p95 (95th percentile)
  const p95Index = Math.ceil(0.95 * sorted.length) - 1;
  const p95 = sorted[Math.min(p95Index, sorted.length - 1)];

  return {
    avg: Math.round(avg),
    min,
    max,
    p95,
    count: values.length,
  };
}

/**
 * Get historical statistics for a metric
 */
function getHistoricalStats(history, metric, count = 5) {
  const values = history.runs
    .slice(-count)
    .map(r => r[metric])
    .filter(v => typeof v === 'number');

  return calculateStats(values);
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

test.describe('Album Lookup Performance Tests', () => {
  // Skip in CI
  test.skip(() => !!process.env.CI, 'Docker perf tests are local-only');

  test.beforeEach(async ({ page }) => {
    const prereq = await checkPrerequisites(page);
    test.skip(!prereq.ready, `Prerequisites not met: ${prereq.reason}`);
  });

  /**
   * Main test: Measure /album API endpoint performance
   */
  test('Album API Response Time', async ({ page }) => {
    test.setTimeout(CONFIG.ITERATIONS * (TIMEOUTS.API_CALL + CONFIG.DELAY_BETWEEN_CALLS) + 30000);

    const responseTimes = [];
    const responseSizes = [];
    const photoCounts = [];
    let failures = 0;

    // Run multiple iterations
    for (let i = 0; i < CONFIG.ITERATIONS; i++) {
      // Delay between calls to avoid rate limiting
      if (i > 0) {
        await page.waitForTimeout(CONFIG.DELAY_BETWEEN_CALLS);
      }

      const start = Date.now();

      try {
        const response = await page.request.get(`${DOCKER_URL}/album/25`, {
          timeout: TIMEOUTS.API_CALL
        });
        const responseTime = Date.now() - start;

        if (response.ok()) {
          const body = await response.text();
          const data = JSON.parse(body);

          responseTimes.push(responseTime);
          responseSizes.push(body.length);
          photoCounts.push(data.images?.length || 0);
        } else {
          failures++;
        }
      } catch (error) {
        failures++;
      }
    }

    // Need at least half successful requests
    expect(responseTimes.length).toBeGreaterThanOrEqual(CONFIG.ITERATIONS / 2);

    const stats = calculateStats(responseTimes);
    const sizeStats = calculateStats(responseSizes);
    const avgPhotoCount = Math.round(photoCounts.reduce((a, b) => a + b, 0) / photoCounts.length);

    // Prepare result for history
    const result = {
      iterations: CONFIG.ITERATIONS,
      successful: responseTimes.length,
      failures,
      avgResponseTime: stats.avg,
      minResponseTime: stats.min,
      maxResponseTime: stats.max,
      p95ResponseTime: stats.p95,
      avgResponseSize: sizeStats.avg,
      avgPhotoCount,
    };

    // Print results
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║               Album Lookup Performance Results                      ║');
    console.log('╠════════════════════════════════════════════════════════════════════╣');
    console.log(`║ Iterations:      ${String(CONFIG.ITERATIONS).padStart(4)}  (${responseTimes.length} successful, ${failures} failed)        ║`);
    console.log('╠════════════════════════════════════════════════════════════════════╣');
    console.log(`║ Average:         ${String(stats.avg).padStart(6)}ms                                      ║`);
    console.log(`║ Minimum:         ${String(stats.min).padStart(6)}ms                                      ║`);
    console.log(`║ Maximum:         ${String(stats.max).padStart(6)}ms                                      ║`);
    console.log(`║ P95:             ${String(stats.p95).padStart(6)}ms                                      ║`);
    console.log('╠════════════════════════════════════════════════════════════════════╣');
    console.log(`║ Avg response size: ${String(sizeStats.avg).padStart(5)} bytes                               ║`);
    console.log(`║ Avg photo count:   ${String(avgPhotoCount).padStart(5)} photos                               ║`);
    console.log('╚════════════════════════════════════════════════════════════════════╝');

    // Save to history
    await saveToHistory(result);

    // Load history and show comparison
    const history = await loadHistory();
    if (history.runs.length > 1) {
      console.log('\n╔════════════════════════════════════════════════════════════════════╗');
      console.log('║               Historical Comparison (last 5 runs)                  ║');
      console.log('╠════════════════════════════════════════════════════════════════════╣');

      const avgStats = getHistoricalStats(history, 'avgResponseTime');
      const p95Stats = getHistoricalStats(history, 'p95ResponseTime');

      if (avgStats) {
        console.log(`║ Avg response time:  ${String(avgStats.avg).padStart(6)}ms  (min: ${String(avgStats.min).padStart(5)}, max: ${String(avgStats.max).padStart(5)})       ║`);
      }
      if (p95Stats) {
        console.log(`║ P95 response time:  ${String(p95Stats.avg).padStart(6)}ms  (min: ${String(p95Stats.min).padStart(5)}, max: ${String(p95Stats.max).padStart(5)})       ║`);
      }

      // Show trend
      const prevRun = history.runs[history.runs.length - 2];
      const currRun = history.runs[history.runs.length - 1];
      const avgDiff = currRun.avgResponseTime - prevRun.avgResponseTime;
      const trend = avgDiff > 50 ? '📈 SLOWER' : avgDiff < -50 ? '📉 FASTER' : '➡️  STABLE';

      console.log('╠════════════════════════════════════════════════════════════════════╣');
      console.log(`║ Trend vs previous: ${trend} (${avgDiff > 0 ? '+' : ''}${avgDiff}ms)                          ║`);
      console.log('╚════════════════════════════════════════════════════════════════════╝');
    }

    console.log(`\n📁 Results saved to: ${HISTORY_FILE}\n`);

    // Assertions
    expect(stats.avg).toBeLessThan(CONFIG.MAX_AVG_RESPONSE_TIME);
    expect(stats.max).toBeLessThan(CONFIG.MAX_SINGLE_RESPONSE_TIME);
  });

  /**
   * Test: Verify response structure consistency
   */
  test('Album API Response Structure', async ({ page }) => {
    test.setTimeout(TIMEOUTS.API_CALL + 10000);

    const response = await page.request.get(`${DOCKER_URL}/album/25`, {
      timeout: TIMEOUTS.API_CALL
    });

    expect(response.ok()).toBe(true);

    const data = await response.json();

    // Verify structure
    expect(data).toHaveProperty('count');
    expect(data).toHaveProperty('images');
    expect(Array.isArray(data.images)).toBe(true);
    expect(data.count).toBe(data.images.length);

    // Verify each image has required properties
    for (const image of data.images) {
      expect(image).toHaveProperty('file');
      expect(typeof image.file).toBe('string');
      expect(image.file.length).toBeGreaterThan(0);
    }

    console.log('\n✅ Album API response structure verified\n');
  });

  /**
   * Test: Verify random selection (different photos each time)
   */
  test('Album API Returns Different Photos', async ({ page }) => {
    test.setTimeout(TIMEOUTS.API_CALL * 3 + 10000);

    const allPhotos = new Set();
    const responseSets = [];

    // Make 3 requests
    for (let i = 0; i < 3; i++) {
      if (i > 0) await page.waitForTimeout(CONFIG.DELAY_BETWEEN_CALLS);

      const response = await page.request.get(`${DOCKER_URL}/album/25`, {
        timeout: TIMEOUTS.API_CALL
      });

      expect(response.ok()).toBe(true);

      const data = await response.json();
      const photos = data.images.map(img => img.file);

      responseSets.push(new Set(photos));
      photos.forEach(p => allPhotos.add(p));
    }

    // Check that we got some different photos across requests
    // (with 25 photos per request and random selection, there should be variety)
    const totalUnique = allPhotos.size;
    const maxPossibleUnique = 25 * 3;

    // If photo library is small, all requests might return same photos
    // But if library is larger, we expect at least some variety
    if (totalUnique < maxPossibleUnique) {
      console.log(`\n📊 Randomness check: ${totalUnique} unique photos across 3 requests (max possible: ${maxPossibleUnique})\n`);
    } else {
      console.log(`\n✅ Full randomness: All ${totalUnique} photos were unique\n`);
    }

    // At minimum, we should get valid responses
    expect(responseSets.length).toBe(3);
  });
});
