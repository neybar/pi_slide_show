/**
 * Album Pre-fetch Module
 *
 * Pure functions for album pre-fetch and transition logic, extracted from main.js
 * for improved testability and maintainability.
 *
 * These functions contain the core decision logic for:
 * - Memory availability checking before prefetch
 * - Album data validation
 * - Transition timing and fallback decisions
 * - Error handling for prefetch operations
 */

/**
 * Check if there is enough memory available for pre-fetching.
 * Uses the Chrome-specific performance.memory API if available.
 * Returns true (allow prefetch) if API is unavailable for graceful degradation.
 *
 * @param {Object|null|undefined} performanceMemory - performance.memory object (or null/undefined if unavailable)
 * @param {number} thresholdMB - Memory threshold in MB
 * @returns {boolean} - True if memory is sufficient or API unavailable
 */
export function hasEnoughMemoryForPrefetch(performanceMemory, thresholdMB) {
    try {
        if (!performanceMemory || typeof performanceMemory.jsHeapSizeLimit === 'undefined') {
            // Graceful degradation: allow prefetch if API unavailable
            return true;
        }

        const availableMemory = performanceMemory.jsHeapSizeLimit - performanceMemory.usedJSHeapSize;
        const thresholdBytes = thresholdMB * 1024 * 1024;

        return availableMemory > thresholdBytes;
    } catch (e) {
        // API can throw in some contexts (workers, strict CSP)
        // Gracefully degrade: allow prefetch
        return true;
    }
}

/**
 * Validate album data from API response.
 *
 * @param {Object|null|undefined} data - Album data from API
 * @returns {boolean} - True if data is valid (has non-empty images array)
 */
export function validateAlbumData(data) {
    return !!(data && Array.isArray(data.images) && data.images.length > 0);
}

/**
 * Check if a forced reload is due for memory hygiene.
 *
 * @param {number} transitionCount - Number of successful transitions so far
 * @param {number} forceReloadInterval - Force reload every N transitions
 * @returns {boolean} - True if forced reload is due
 */
export function shouldForcedReload(transitionCount, forceReloadInterval) {
    return transitionCount >= forceReloadInterval;
}

/**
 * Determine if we should fall back to page reload instead of seamless transition.
 *
 * @param {boolean} prefetchComplete - Whether prefetch completed successfully
 * @param {number} photosLoaded - Number of photos loaded in prefetch
 * @param {number} minPhotosForTransition - Minimum photos required for transition
 * @returns {Object} - { shouldReload: boolean, reason: string|null }
 */
export function shouldFallbackToReload(prefetchComplete, photosLoaded, minPhotosForTransition) {
    if (!prefetchComplete) {
        return { shouldReload: true, reason: 'prefetch_incomplete' };
    }

    if (photosLoaded < minPhotosForTransition) {
        return { shouldReload: true, reason: 'insufficient_photos' };
    }

    return { shouldReload: false, reason: null };
}

/**
 * Check if an error is an AbortError (from AbortController).
 * AbortError is not a real error - it's an intentional cancellation.
 *
 * @param {Error|Object|null|undefined} error - Error object
 * @returns {boolean} - True if error is an AbortError
 */
export function isAbortError(error) {
    return !!(error && error.name === 'AbortError');
}

/**
 * Clamp prefetch lead time to prevent misconfiguration.
 * Ensures prefetch doesn't start too late (must start before next swap cycle).
 *
 * @param {number} prefetchLeadTime - Desired prefetch lead time (ms)
 * @param {number} refreshAlbumTime - Album refresh interval (ms)
 * @param {number} swapInterval - Photo swap interval (ms)
 * @returns {number} - Clamped prefetch lead time (ms)
 */
export function clampPrefetchLeadTime(prefetchLeadTime, refreshAlbumTime, swapInterval) {
    const maxLeadTime = refreshAlbumTime - swapInterval;
    return Math.min(prefetchLeadTime, maxLeadTime);
}

// Browser global exports for non-module scripts (main.js)
if (typeof window !== 'undefined') {
    window.SlideshowPrefetch = {
        hasEnoughMemoryForPrefetch: hasEnoughMemoryForPrefetch,
        validateAlbumData: validateAlbumData,
        shouldForcedReload: shouldForcedReload,
        shouldFallbackToReload: shouldFallbackToReload,
        isAbortError: isAbortError,
        clampPrefetchLeadTime: clampPrefetchLeadTime
    };
}
