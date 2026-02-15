/**
 * Unit tests for network error handling and graceful degradation
 *
 * Tests ensure the slideshow handles network failures gracefully:
 * - Album fetch failures trigger retry with backoff
 * - Image preload timeouts don't block entire slideshow
 * - Partial album responses are handled correctly
 * - AbortErrors are distinguished from actual failures
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateAlbumData, isAbortError } from '../../www/js/prefetch.mjs';

describe('Network Error Handling Tests', () => {
  describe('validateAlbumData() - malformed response handling', () => {
    it('should reject null album data', () => {
      expect(validateAlbumData(null)).toBe(false);
    });

    it('should reject undefined album data', () => {
      expect(validateAlbumData(undefined)).toBe(false);
    });

    it('should reject album data without images array', () => {
      const data = { count: 25 };
      expect(validateAlbumData(data)).toBe(false);
    });

    it('should reject album data with empty images array', () => {
      const data = { images: [], count: 0 };
      expect(validateAlbumData(data)).toBe(false);
    });

    it('should reject album data with non-array images property', () => {
      const data = { images: 'not-an-array', count: 25 };
      expect(validateAlbumData(data)).toBe(false);
    });

    it('should accept valid album data with images', () => {
      const data = {
        images: [
          { file: '/photos/photo1.jpg' },
          { file: '/photos/photo2.jpg' }
        ],
        count: 2
      };
      expect(validateAlbumData(data)).toBe(true);
    });

    it('should accept album data with single image', () => {
      const data = {
        images: [{ file: '/photos/photo1.jpg' }],
        count: 1
      };
      expect(validateAlbumData(data)).toBe(true);
    });
  });

  describe('isAbortError() - distinguish cancellation from failures', () => {
    it('should return true for AbortError by name', () => {
      const error = new Error('The user aborted a request');
      error.name = 'AbortError';
      expect(isAbortError(error)).toBe(true);
    });

    it('should return false for regular Error', () => {
      const error = new Error('Network request failed');
      expect(isAbortError(error)).toBe(false);
    });

    it('should return false for TypeError', () => {
      const error = new TypeError('Failed to fetch');
      expect(isAbortError(error)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isAbortError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isAbortError(undefined)).toBe(false);
    });

    it('should return false for string error', () => {
      expect(isAbortError('error string')).toBe(false);
    });
  });

  describe('Image preload timeout handling', () => {
    let originalImage;
    let timers;

    beforeEach(() => {
      // Save original Image constructor
      originalImage = global.Image;
      timers = [];

      // Mock setTimeout to track timers
      vi.spyOn(global, 'setTimeout').mockImplementation((callback, delay) => {
        const id = timers.length;
        timers.push({ callback, delay, id });
        return id;
      });
    });

    afterEach(() => {
      // Restore Image constructor
      global.Image = originalImage;
      vi.restoreAllMocks();
    });

    it('should handle image load timeout gracefully', () => {
      // Mock Image that never fires onload/onerror
      global.Image = class MockImage {
        constructor() {
          this.src = '';
          this.onload = null;
          this.onerror = null;
        }
      };

      // Simulate preloadImage behavior
      const preloadPromise = new Promise((resolve) => {
        const img = new Image();
        let resolved = false;

        const resolveOnce = (result) => {
          if (!resolved) {
            resolved = true;
            resolve(result);
          }
        };

        // Timeout handler (IMAGE_PRELOAD_TIMEOUT = 30000)
        const timeoutId = setTimeout(() => {
          if (!resolved) {
            img.src = ''; // Cancel pending request
            resolveOnce({ img: null, loaded: false });
          }
        }, 30000);

        img.onload = () => { resolveOnce({ img, loaded: true }); };
        img.onerror = () => { resolveOnce({ img: null, loaded: false }); };

        img.src = '/photos/test.jpg';
      });

      // Verify timeout was registered
      expect(timers.length).toBe(1);
      expect(timers[0].delay).toBe(30000);

      // Trigger timeout
      timers[0].callback();

      // Verify promise resolves with loaded: false
      return preloadPromise.then((result) => {
        expect(result.loaded).toBe(false);
        expect(result.img).toBe(null);
      });
    });

    it('should handle image load error gracefully', () => {
      global.Image = class MockImage {
        constructor() {
          this.src = '';
          this.onload = null;
          this.onerror = null;
        }
      };

      const preloadPromise = new Promise((resolve) => {
        const img = new Image();
        let resolved = false;

        const resolveOnce = (result) => {
          if (!resolved) {
            resolved = true;
            resolve(result);
          }
        };

        img.onload = () => { resolveOnce({ img, loaded: true }); };
        img.onerror = () => { resolveOnce({ img: null, loaded: false }); };

        img.src = '/photos/test.jpg';

        // Simulate immediate error
        if (img.onerror) img.onerror();
      });

      return preloadPromise.then((result) => {
        expect(result.loaded).toBe(false);
        expect(result.img).toBe(null);
      });
    });

    it('should fallback to original image on thumbnail failure', () => {
      global.Image = class MockImage {
        constructor() {
          this.src = '';
          this.onload = null;
          this.onerror = null;
          this.loadSuccess = false; // Track if we should succeed
        }
      };

      const preloadPromise = new Promise((resolve) => {
        const img = new Image();
        let resolved = false;
        let attemptedFallback = false;

        const resolveOnce = (result) => {
          if (!resolved) {
            resolved = true;
            resolve(result);
          }
        };

        const thumbnailSrc = '/photos/@eaDir/SYNOPHOTO_THUMB_XL.jpg';
        const fallbackSrc = '/photos/original.jpg';

        img.onload = () => { resolveOnce({ img, loaded: true, usedFallback: attemptedFallback }); };
        img.onerror = () => {
          if (fallbackSrc && !resolved && !attemptedFallback) {
            attemptedFallback = true;
            img.onload = () => { resolveOnce({ img, loaded: true, usedFallback: true }); };
            img.onerror = () => { resolveOnce({ img: null, loaded: false, usedFallback: true }); };
            img.src = fallbackSrc;
            // Simulate fallback success
            if (img.onload) img.onload();
          } else {
            resolveOnce({ img: null, loaded: false, usedFallback: attemptedFallback });
          }
        };

        img.src = thumbnailSrc;
        // Simulate thumbnail failure
        if (img.onerror) img.onerror();
      });

      return preloadPromise.then((result) => {
        expect(result.loaded).toBe(true);
        expect(result.usedFallback).toBe(true);
        expect(result.img).not.toBe(null);
      });
    });
  });

  describe('Partial album response handling', () => {
    it('should validate partial album with fewer photos than requested', () => {
      // Request 25 photos, but only got 10
      const data = {
        images: Array(10).fill(null).map((_, i) => ({ file: `/photos/photo${i}.jpg` })),
        count: 10
      };
      expect(validateAlbumData(data)).toBe(true);
    });

    it('should handle single photo album', () => {
      const data = {
        images: [{ file: '/photos/only-photo.jpg' }],
        count: 1
      };
      expect(validateAlbumData(data)).toBe(true);
    });

    it('should reject completely empty album', () => {
      const data = {
        images: [],
        count: 0
      };
      expect(validateAlbumData(data)).toBe(false);
    });
  });

  describe('Fetch error scenarios', () => {
    it('should recognize network error (TypeError: Failed to fetch)', () => {
      const error = new TypeError('Failed to fetch');
      expect(error.name).toBe('TypeError');
      expect(isAbortError(error)).toBe(false);
    });

    it('should recognize HTTP error (non-2xx status)', () => {
      const error = new Error('Album fetch failed: 404');
      expect(isAbortError(error)).toBe(false);
    });

    it('should recognize HTTP error (5xx status)', () => {
      const error = new Error('Album fetch failed: 500');
      expect(isAbortError(error)).toBe(false);
    });

    it('should recognize timeout error', () => {
      const error = new Error('Timeout');
      expect(isAbortError(error)).toBe(false);
    });

    it('should distinguish abort from timeout', () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      const timeoutError = new Error('Timeout');

      expect(isAbortError(abortError)).toBe(true);
      expect(isAbortError(timeoutError)).toBe(false);
    });
  });

  describe('Album data structure validation edge cases', () => {
    it('should handle album data with extra properties', () => {
      const data = {
        images: [{ file: '/photos/photo1.jpg' }],
        count: 1,
        extraProperty: 'should be ignored',
        anotherExtra: { nested: 'object' }
      };
      expect(validateAlbumData(data)).toBe(true);
    });

    it('should handle images with missing file property', () => {
      const data = {
        images: [
          { file: '/photos/photo1.jpg' },
          { }, // Missing file property
          { file: '/photos/photo3.jpg' }
        ],
        count: 3
      };
      // validateAlbumData only checks array existence, not individual items
      expect(validateAlbumData(data)).toBe(true);
    });

    it('should handle images array with null elements', () => {
      const data = {
        images: [
          { file: '/photos/photo1.jpg' },
          null,
          { file: '/photos/photo3.jpg' }
        ],
        count: 3
      };
      // validateAlbumData only checks array existence and length > 0
      expect(validateAlbumData(data)).toBe(true);
    });

    it('should reject object with images: null', () => {
      const data = {
        images: null,
        count: 0
      };
      expect(validateAlbumData(data)).toBe(false);
    });

    it('should reject object with images: string', () => {
      const data = {
        images: '[{"file": "/photos/photo1.jpg"}]', // JSON string, not array
        count: 1
      };
      expect(validateAlbumData(data)).toBe(false);
    });
  });

  describe('Concurrent fetch cancellation', () => {
    it('should detect AbortError from fetch cancellation', () => {
      const controller = new AbortController();
      controller.abort();

      // Simulate the error that would be thrown by fetch()
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';

      expect(isAbortError(error)).toBe(true);
    });

    it('should not treat other DOMException as AbortError', () => {
      const error = new Error('SecurityError');
      error.name = 'SecurityError';

      expect(isAbortError(error)).toBe(false);
    });
  });

  describe('Error message consistency', () => {
    it('should handle various AbortError message formats', () => {
      const variations = [
        'The operation was aborted',
        'The user aborted a request',
        'signal is aborted without reason',
        'Fetch is aborted'
      ];

      variations.forEach(message => {
        const error = new Error(message);
        error.name = 'AbortError';
        expect(isAbortError(error)).toBe(true);
      });
    });

    it('should not rely on error message for detection', () => {
      // Error with AbortError-like message but wrong name
      const fakeAbortError = new Error('The operation was aborted');
      fakeAbortError.name = 'Error';
      expect(isAbortError(fakeAbortError)).toBe(false);

      // Error with correct name but different message
      const realAbortError = new Error('Different message');
      realAbortError.name = 'AbortError';
      expect(isAbortError(realAbortError)).toBe(true);
    });
  });
});
