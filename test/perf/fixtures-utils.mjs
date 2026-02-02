/**
 * Shared utility functions for performance tests using fixtures.
 *
 * This module provides common functionality for loading pages with fixture data
 * injected, avoiding code duplication across performance test files.
 */

/**
 * Load page with fixture data injected.
 * Falls back to regular page loading if fixture data is not provided.
 *
 * This overrides jQuery.getJSON to return the fixture data instead of
 * fetching from /album/25, enabling reproducible performance tests.
 *
 * @param {Page} page - Playwright page object
 * @param {string} serverUrl - Base URL of the server
 * @param {object|null} fixtureData - Fixture data to inject, or null for regular loading
 * @returns {Promise<void>}
 */
export async function loadPageWithFixture(page, serverUrl, fixtureData = null) {
  // Navigate to page
  await page.goto(serverUrl, { waitUntil: 'domcontentloaded' });

  if (fixtureData) {
    // Inject test mode that uses fixture data instead of fetching /album/25
    await page.evaluate((data) => {
      // Store fixture for test verification
      window.__testFixtureData = data;
      window.__testFixtureUsed = false;

      // Override jQuery.getJSON to return our fixture data
      if (window.$ && window.$.getJSON) {
        const originalGetJSON = window.$.getJSON;
        window.$.getJSON = function(url, callback) {
          // Only intercept album requests
          if (url.includes('/album/')) {
            window.__testFixtureUsed = true;
            // Simulate async response with fixture data
            const deferred = window.$.Deferred();
            setTimeout(() => {
              if (typeof callback === 'function') {
                callback(data);
              }
              deferred.resolve(data);
            }, 10);
            return deferred.promise();
          }
          // Pass through other requests
          return originalGetJSON.apply(this, arguments);
        };
      }
    }, fixtureData);
  }
}

/**
 * Fetch fixture data from a server's fixture endpoint.
 *
 * @param {Page} page - Playwright page object
 * @param {string} serverUrl - Base URL of the server
 * @param {string} year - Fixture year (2010, 2015, 2020, 2025)
 * @param {number} timeout - Request timeout in ms (default: 5000)
 * @returns {Promise<object|null>} Fixture data or null if not available
 */
export async function fetchFixtureData(page, serverUrl, year, timeout = 5000) {
  try {
    const response = await page.request.get(`${serverUrl}/album/fixture/${year}`, {
      timeout
    });
    if (response.ok()) {
      return await response.json();
    }
  } catch {
    // Fixture endpoint not available
  }
  return null;
}

/**
 * Check if a server supports the fixture endpoint.
 *
 * @param {Page} page - Playwright page object
 * @param {string} serverUrl - Base URL of the server
 * @param {string} year - Fixture year to check (default: '2020')
 * @param {number} timeout - Request timeout in ms (default: 5000)
 * @returns {Promise<boolean>} True if fixtures are supported
 */
export async function checkFixtureSupport(page, serverUrl, year = '2020', timeout = 5000) {
  try {
    const response = await page.request.get(`${serverUrl}/album/fixture/${year}`, {
      timeout
    });
    return response.ok();
  } catch {
    return false;
  }
}

/**
 * Load existing performance history from a JSON file.
 *
 * @param {object} fs - Node.js fs/promises module
 * @param {string} historyFile - Path to history file
 * @returns {Promise<object>} History object with runs array
 */
export async function loadHistory(fs, historyFile) {
  try {
    const data = await fs.readFile(historyFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { runs: [] };
  }
}

/**
 * Save performance result to history file.
 * Keeps last 50 runs to prevent unbounded growth.
 *
 * @param {object} fs - Node.js fs/promises module
 * @param {string} resultsDir - Directory for results
 * @param {string} historyFile - Path to history file
 * @param {object} result - Performance result to save
 * @param {string} gitCommit - Git commit hash
 * @returns {Promise<void>}
 */
export async function saveToHistory(fs, resultsDir, historyFile, result, gitCommit) {
  await fs.mkdir(resultsDir, { recursive: true });

  const history = await loadHistory(fs, historyFile);

  // Add new result
  history.runs.push({
    timestamp: new Date().toISOString(),
    gitCommit,
    ...result,
  });

  // Keep last 50 runs
  if (history.runs.length > 50) {
    history.runs = history.runs.slice(-50);
  }

  await fs.writeFile(historyFile, JSON.stringify(history, null, 2));
}

/**
 * Get current git commit hash.
 *
 * @param {Function} execSync - Node.js execSync function
 * @returns {string} Short git commit hash or 'unknown'
 */
export function getGitCommit(execSync) {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return process.env.GIT_COMMIT || 'unknown';
  }
}

/**
 * Calculate statistics from an array of numeric values.
 *
 * @param {number[]} values - Array of numeric values
 * @returns {object|null} Statistics object with avg, min, max, p95, count
 */
export function calculateStats(values) {
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
