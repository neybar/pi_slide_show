/**
 * Shared utility functions for progressive loading.
 * These pure functions are used by both the frontend (www/js/main.js) and tests.
 *
 * IMPORTANT: This module exports functions that work in both browser and Node.js.
 * - Browser: Functions attached to window.SlideshowUtils
 * - Tests: Import directly from this module
 */

/**
 * Build the Synology thumbnail path for a photo.
 * @param {string} filePath - Original file path
 * @param {string} [size='XL'] - Thumbnail size: 'M' (medium) or 'XL' (extra large)
 * @returns {string} - Thumbnail path
 */
export function buildThumbnailPath(filePath, size) {
    size = size || 'XL';
    const s = filePath.split('/');
    s.splice(s.length - 1, 0, '@eaDir');
    s.splice(s.length, 0, 'SYNOPHOTO_THUMB_' + size + '.jpg');
    return s.join('/');
}

/**
 * Map quality string to numeric level for comparison.
 * Higher number = higher quality.
 * @param {string} quality - Quality string: 'M', 'XL', or 'original'
 * @returns {number} - Numeric level (0 for invalid)
 */
export function qualityLevel(quality) {
    const levels = { 'M': 1, 'XL': 2, 'original': 3 };
    return levels[quality] || 0;
}

/**
 * Check if an upgrade should be skipped based on quality levels.
 * @param {string} currentQuality - Current quality level
 * @param {string} targetQuality - Target quality level
 * @returns {boolean} - True if upgrade should be skipped
 */
export function shouldSkipUpgrade(currentQuality, targetQuality) {
    const currentLevel = qualityLevel(currentQuality);
    const targetLevel = qualityLevel(targetQuality);
    return currentLevel >= targetLevel;
}

/**
 * Delay helper for throttling operations.
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise} - Resolves after delay
 */
export function delay(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

/**
 * Load photos in batches to prevent network/CPU saturation.
 * Pure function version that accepts a preloader function for testing.
 * @param {Object[]} photos - Array of photo data objects
 * @param {string} quality - Quality level: 'M' or 'XL'
 * @param {number} batchSize - Number of photos per batch
 * @param {Function} preloader - Function to preload a single photo (returns Promise)
 * @returns {Promise<Object[]>} - Array of all loaded results
 */
export async function loadPhotosInBatches(photos, quality, batchSize, preloader) {
    const results = [];
    const batches = [];

    // Split photos into batches
    for (let i = 0; i < photos.length; i += batchSize) {
        batches.push(photos.slice(i, i + batchSize));
    }

    // Process batches sequentially
    for (const batch of batches) {
        const batchPromises = batch.map(photo => preloader(photo, quality));
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
    }

    return results;
}

// Make available as global for browser usage (non-module scripts)
if (typeof window !== 'undefined') {
    window.SlideshowUtils = {
        buildThumbnailPath,
        qualityLevel,
        shouldSkipUpgrade,
        delay,
        loadPhotosInBatches
    };
}
