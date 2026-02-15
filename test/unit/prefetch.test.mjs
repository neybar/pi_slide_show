/**
 * Unit tests for album pre-fetch and transition functionality
 *
 * Pure function versions extracted from www/js/main.js for testability.
 * SYNC: Keep in sync with www/js/main.js prefetch functions
 */

import { describe, it, expect } from 'vitest';

/**
 * Pure function version of hasEnoughMemoryForPrefetch logic
 *
 * @param {Object} performanceMemory - performance.memory object or null
 * @param {number} thresholdMB - Memory threshold in MB
 * @returns {boolean} - True if enough memory available or API unavailable
 */
function hasEnoughMemoryForPrefetch(performanceMemory, thresholdMB) {
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
 * Pure function version of shouldForcedReload logic
 *
 * @param {number} transitionCount - Number of successful transitions so far
 * @param {number} forceReloadInterval - Force reload every N transitions
 * @returns {boolean} - True if forced reload is due
 */
function shouldForcedReload(transitionCount, forceReloadInterval) {
  return transitionCount >= forceReloadInterval;
}

/**
 * Pure function version of shouldFallbackToReload logic
 *
 * @param {boolean} prefetchComplete - Whether prefetch completed successfully
 * @param {number} photosLoaded - Number of photos loaded
 * @param {number} minPhotosForTransition - Minimum photos required
 * @returns {Object} - { shouldReload: boolean, reason: string }
 */
function shouldFallbackToReload(prefetchComplete, photosLoaded, minPhotosForTransition) {
  if (!prefetchComplete) {
    return { shouldReload: true, reason: 'prefetch_incomplete' };
  }

  if (photosLoaded < minPhotosForTransition) {
    return { shouldReload: true, reason: 'insufficient_photos' };
  }

  return { shouldReload: false, reason: null };
}

/**
 * Pure function version of isAbortError check
 *
 * @param {Error} error - Error object
 * @returns {boolean} - True if error is an AbortError
 */
function isAbortError(error) {
  return !!(error && error.name === 'AbortError');
}

/**
 * Pure function version of validateAlbumData
 *
 * @param {Object} data - Album data from API
 * @returns {boolean} - True if data is valid
 */
function validateAlbumData(data) {
  return !!(data && Array.isArray(data.images) && data.images.length > 0);
}

/**
 * Pure function version of clampPrefetchLeadTime
 *
 * @param {number} prefetchLeadTime - Desired prefetch lead time (ms)
 * @param {number} refreshAlbumTime - Album refresh interval (ms)
 * @param {number} swapInterval - Photo swap interval (ms)
 * @returns {number} - Clamped prefetch lead time
 */
function clampPrefetchLeadTime(prefetchLeadTime, refreshAlbumTime, swapInterval) {
  const maxLeadTime = refreshAlbumTime - swapInterval;
  return Math.min(prefetchLeadTime, maxLeadTime);
}

describe('Album Pre-fetch and Transition Tests', () => {
  describe('hasEnoughMemoryForPrefetch()', () => {
    it('should return true when memory is sufficient', () => {
      const memory = {
        usedJSHeapSize: 50 * 1024 * 1024, // 50MB used
        jsHeapSizeLimit: 200 * 1024 * 1024 // 200MB limit
      };

      const result = hasEnoughMemoryForPrefetch(memory, 100);
      expect(result).toBe(true);
    });

    it('should return false when memory below threshold', () => {
      const memory = {
        usedJSHeapSize: 150 * 1024 * 1024, // 150MB used
        jsHeapSizeLimit: 200 * 1024 * 1024 // 200MB limit (50MB available < 100MB threshold)
      };

      const result = hasEnoughMemoryForPrefetch(memory, 100);
      expect(result).toBe(false);
    });

    it('should return true when memory API is null (graceful degradation)', () => {
      const result = hasEnoughMemoryForPrefetch(null, 100);
      expect(result).toBe(true);
    });

    it('should return true when memory API is undefined (graceful degradation)', () => {
      const result = hasEnoughMemoryForPrefetch(undefined, 100);
      expect(result).toBe(true);
    });

    it('should return true when memory API is incomplete', () => {
      const memory = {
        // Missing jsHeapSizeLimit
        usedJSHeapSize: 50 * 1024 * 1024
      };

      const result = hasEnoughMemoryForPrefetch(memory, 100);
      expect(result).toBe(true);
    });

    it('should return false when exactly at threshold (edge case)', () => {
      const memory = {
        usedJSHeapSize: 100 * 1024 * 1024, // 100MB used
        jsHeapSizeLimit: 200 * 1024 * 1024 // 200MB limit (exactly 100MB available)
      };

      const result = hasEnoughMemoryForPrefetch(memory, 100);
      expect(result).toBe(false); // Should be > not >=
    });

    it('should return true when slightly above threshold', () => {
      const memory = {
        usedJSHeapSize: 99 * 1024 * 1024, // 99MB used
        jsHeapSizeLimit: 200 * 1024 * 1024 // 200MB limit (101MB available)
      };

      const result = hasEnoughMemoryForPrefetch(memory, 100);
      expect(result).toBe(true);
    });
  });

  describe('shouldForcedReload()', () => {
    it('should return true when transitionCount >= forceReloadInterval', () => {
      expect(shouldForcedReload(8, 8)).toBe(true);
      expect(shouldForcedReload(9, 8)).toBe(true);
      expect(shouldForcedReload(100, 8)).toBe(true);
    });

    it('should return false when transitionCount < forceReloadInterval', () => {
      expect(shouldForcedReload(0, 8)).toBe(false);
      expect(shouldForcedReload(5, 8)).toBe(false);
      expect(shouldForcedReload(7, 8)).toBe(false);
    });

    it('should handle edge case with forceReloadInterval = 1', () => {
      expect(shouldForcedReload(0, 1)).toBe(false);
      expect(shouldForcedReload(1, 1)).toBe(true);
      expect(shouldForcedReload(2, 1)).toBe(true);
    });
  });

  describe('shouldFallbackToReload()', () => {
    it('should reload when prefetch incomplete', () => {
      const result = shouldFallbackToReload(false, 25, 15);
      expect(result.shouldReload).toBe(true);
      expect(result.reason).toBe('prefetch_incomplete');
    });

    it('should reload when insufficient photos loaded', () => {
      const result = shouldFallbackToReload(true, 10, 15);
      expect(result.shouldReload).toBe(true);
      expect(result.reason).toBe('insufficient_photos');
    });

    it('should NOT reload when prefetch complete with enough photos', () => {
      const result = shouldFallbackToReload(true, 25, 15);
      expect(result.shouldReload).toBe(false);
      expect(result.reason).toBe(null);
    });

    it('should NOT reload when exactly at minimum photo count', () => {
      const result = shouldFallbackToReload(true, 15, 15);
      expect(result.shouldReload).toBe(false);
      expect(result.reason).toBe(null);
    });

    it('should prioritize prefetch incomplete over insufficient photos', () => {
      const result = shouldFallbackToReload(false, 10, 15);
      expect(result.shouldReload).toBe(true);
      expect(result.reason).toBe('prefetch_incomplete'); // First check wins
    });
  });

  describe('isAbortError()', () => {
    it('should return true for AbortError', () => {
      const error = new Error('Operation aborted');
      error.name = 'AbortError';
      expect(isAbortError(error)).toBe(true);
    });

    it('should return false for other errors', () => {
      const error = new Error('Network error');
      error.name = 'NetworkError';
      expect(isAbortError(error)).toBe(false);
    });

    it('should return false for Error without name property', () => {
      const error = new Error('Generic error');
      delete error.name;
      expect(isAbortError(error)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isAbortError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isAbortError(undefined)).toBe(false);
    });
  });

  describe('validateAlbumData()', () => {
    it('should return true for valid album data', () => {
      const data = {
        album_name: 'Test Album',
        images: [
          { file_path: '/photos/photo1.jpg', orientation: 1 },
          { file_path: '/photos/photo2.jpg', orientation: 1 }
        ]
      };
      expect(validateAlbumData(data)).toBe(true);
    });

    it('should return false when data is null', () => {
      expect(validateAlbumData(null)).toBe(false);
    });

    it('should return false when data is undefined', () => {
      expect(validateAlbumData(undefined)).toBe(false);
    });

    it('should return false when images is not an array', () => {
      const data = {
        album_name: 'Test Album',
        images: 'not an array'
      };
      expect(validateAlbumData(data)).toBe(false);
    });

    it('should return false when images is empty array', () => {
      const data = {
        album_name: 'Test Album',
        images: []
      };
      expect(validateAlbumData(data)).toBe(false);
    });

    it('should return false when images is missing', () => {
      const data = {
        album_name: 'Test Album'
        // images missing
      };
      expect(validateAlbumData(data)).toBe(false);
    });
  });

  describe('clampPrefetchLeadTime()', () => {
    it('should return original value when within bounds', () => {
      const result = clampPrefetchLeadTime(60000, 900000, 10000);
      expect(result).toBe(60000); // 60s < (900s - 10s) = 890s
    });

    it('should clamp to max when prefetch lead time too large', () => {
      const result = clampPrefetchLeadTime(1000000, 900000, 10000);
      expect(result).toBe(890000); // Clamped to (900s - 10s)
    });

    it('should handle edge case where lead time equals max', () => {
      const result = clampPrefetchLeadTime(890000, 900000, 10000);
      expect(result).toBe(890000);
    });

    it('should handle zero swap interval', () => {
      const result = clampPrefetchLeadTime(60000, 900000, 0);
      expect(result).toBe(60000);
    });

    it('should handle negative result gracefully', () => {
      // Pathological case: swap interval > refresh time
      const result = clampPrefetchLeadTime(60000, 10000, 20000);
      expect(result).toBe(-10000); // Clamped to negative (caller should handle)
    });
  });

  describe('Integration Scenarios', () => {
    it('should allow prefetch when memory OK and not at forced reload threshold', () => {
      const memory = {
        usedJSHeapSize: 50 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024
      };

      const memoryOK = hasEnoughMemoryForPrefetch(memory, 100);
      const forcedReload = shouldForcedReload(5, 8);

      expect(memoryOK).toBe(true);
      expect(forcedReload).toBe(false);
      // Prefetch should proceed
    });

    it('should skip prefetch when memory low even if not at forced reload', () => {
      const memory = {
        usedJSHeapSize: 180 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024
      };

      const memoryOK = hasEnoughMemoryForPrefetch(memory, 100);
      const forcedReload = shouldForcedReload(5, 8);

      expect(memoryOK).toBe(false);
      expect(forcedReload).toBe(false);
      // Prefetch should be skipped, fallback to reload
    });

    it('should force reload regardless of memory when at threshold', () => {
      const memory = {
        usedJSHeapSize: 50 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024
      };

      const memoryOK = hasEnoughMemoryForPrefetch(memory, 100);
      const forcedReload = shouldForcedReload(8, 8);

      expect(memoryOK).toBe(true);
      expect(forcedReload).toBe(true);
      // Should reload for memory hygiene despite good memory
    });

    it('should handle complete successful prefetch scenario', () => {
      const memory = {
        usedJSHeapSize: 50 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024
      };
      const albumData = {
        album_name: '2024-01',
        images: Array(25).fill({}).map((_, i) => ({
          file_path: `/photos/photo${i}.jpg`,
          orientation: 1
        }))
      };

      const memoryOK = hasEnoughMemoryForPrefetch(memory, 100);
      const validData = validateAlbumData(albumData);
      const { shouldReload } = shouldFallbackToReload(true, 25, 15);
      const forcedReload = shouldForcedReload(3, 8);

      expect(memoryOK).toBe(true);
      expect(validData).toBe(true);
      expect(shouldReload).toBe(false);
      expect(forcedReload).toBe(false);
      // All checks pass - seamless transition should proceed
    });
  });

  describe('Prefetch Timing', () => {
    it('should trigger prefetch at correct time before transition', () => {
      const refreshAlbumTime = 900000; // 15 minutes
      const prefetchLeadTime = 60000; // 1 minute
      const now = 840000; // 14 minutes elapsed

      const timeUntilTransition = refreshAlbumTime - now; // 60s remaining
      const shouldStartPrefetch = timeUntilTransition <= prefetchLeadTime;

      expect(shouldStartPrefetch).toBe(true);
    });

    it('should NOT trigger prefetch too early', () => {
      const refreshAlbumTime = 900000; // 15 minutes
      const prefetchLeadTime = 60000; // 1 minute
      const now = 800000; // 13.33 minutes elapsed

      const timeUntilTransition = refreshAlbumTime - now; // 100s remaining
      const shouldStartPrefetch = timeUntilTransition <= prefetchLeadTime;

      expect(shouldStartPrefetch).toBe(false);
    });

    it('should clamp lead time to prevent immediate prefetch on page load', () => {
      const refreshAlbumTime = 900000; // 15 minutes
      const swapInterval = 10000; // 10 seconds
      const misconfiguredLeadTime = 1000000; // 16.67 minutes (> refresh time!)

      const clampedLeadTime = clampPrefetchLeadTime(
        misconfiguredLeadTime,
        refreshAlbumTime,
        swapInterval
      );

      expect(clampedLeadTime).toBe(890000); // 14:50, not 16:40
    });
  });

  describe('Transition Count Management', () => {
    it('should increment on successful transition', () => {
      let transitionCount = 3;
      const prefetchComplete = true;
      const photosLoaded = 25;

      const { shouldReload } = shouldFallbackToReload(prefetchComplete, photosLoaded, 15);

      if (!shouldReload) {
        transitionCount++; // Simulate increment
      }

      expect(transitionCount).toBe(4);
    });

    it('should NOT increment on reload fallback', () => {
      let transitionCount = 3;
      const prefetchComplete = false;
      const photosLoaded = 10;

      const { shouldReload } = shouldFallbackToReload(prefetchComplete, photosLoaded, 15);

      if (!shouldReload) {
        transitionCount++; // Simulate increment
      }

      expect(transitionCount).toBe(3); // NOT incremented
    });

    it('should reset to 0 after forced reload', () => {
      let transitionCount = 8;
      const forcedReload = shouldForcedReload(transitionCount, 8);

      if (forcedReload) {
        transitionCount = 0; // Simulate reset via page reload
      }

      expect(transitionCount).toBe(0);
    });
  });
});
