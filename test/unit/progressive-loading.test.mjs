import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PROGRESSIVE_LOADING_ENABLED,
  INITIAL_BATCH_SIZE,
  INITIAL_QUALITY,
  FINAL_QUALITY,
  UPGRADE_BATCH_SIZE,
  UPGRADE_DELAY_MS,
  LOAD_BATCH_SIZE
} from '../../www/js/config.mjs';

/**
 * Pure function versions of progressive loading algorithms from www/js/main.js
 * These extract the core logic for testability without jQuery dependency.
 * Configuration constants are imported from www/js/config.mjs (shared with main.js)
 */

/**
 * Build the Synology thumbnail path for a photo.
 * @param {string} filePath - Original file path
 * @param {string} [size='XL'] - Thumbnail size: 'M' (medium) or 'XL' (extra large)
 * @returns {string} - Thumbnail path
 */
function buildThumbnailPath(filePath, size) {
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
function qualityLevel(quality) {
  const levels = { 'M': 1, 'XL': 2, 'original': 3 };
  return levels[quality] || 0;
}

/**
 * Delay helper for throttling operations.
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise} - Resolves after delay
 */
function delay(ms) {
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
async function loadPhotosInBatches(photos, quality, batchSize, preloader) {
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

/**
 * Check if an upgrade should be skipped based on quality levels.
 * @param {string} currentQuality - Current quality level
 * @param {string} targetQuality - Target quality level
 * @returns {boolean} - True if upgrade should be skipped
 */
function shouldSkipUpgrade(currentQuality, targetQuality) {
  const currentLevel = qualityLevel(currentQuality);
  const targetLevel = qualityLevel(targetQuality);
  return currentLevel >= targetLevel;
}

// ============================================================================
// Tests
// ============================================================================

describe('Progressive Loading Algorithm', () => {
  describe('Configuration Constants', () => {
    it('should have correct default values', () => {
      expect(PROGRESSIVE_LOADING_ENABLED).toBe(true);
      expect(INITIAL_BATCH_SIZE).toBe(15);
      expect(INITIAL_QUALITY).toBe('M');
      expect(FINAL_QUALITY).toBe('XL');
      expect(UPGRADE_BATCH_SIZE).toBe(5);
      expect(UPGRADE_DELAY_MS).toBe(100);
      expect(LOAD_BATCH_SIZE).toBe(5);
    });
  });

  describe('buildThumbnailPath - Thumbnail Path Construction', () => {
    describe('default behavior (backward compatibility)', () => {
      it('should default to XL when no size provided', () => {
        const result = buildThumbnailPath('/photos/2024/vacation/beach.jpg');
        expect(result).toBe('/photos/2024/vacation/@eaDir/beach.jpg/SYNOPHOTO_THUMB_XL.jpg');
      });

      it('should default to XL with undefined size', () => {
        const result = buildThumbnailPath('/photos/image.jpg', undefined);
        expect(result).toBe('/photos/@eaDir/image.jpg/SYNOPHOTO_THUMB_XL.jpg');
      });

      it('should default to XL with null size', () => {
        const result = buildThumbnailPath('/photos/image.jpg', null);
        expect(result).toBe('/photos/@eaDir/image.jpg/SYNOPHOTO_THUMB_XL.jpg');
      });
    });

    describe('size parameter handling', () => {
      it('should correctly build path for M size', () => {
        const result = buildThumbnailPath('/photos/2024/vacation/beach.jpg', 'M');
        expect(result).toBe('/photos/2024/vacation/@eaDir/beach.jpg/SYNOPHOTO_THUMB_M.jpg');
      });

      it('should correctly build path for XL size', () => {
        const result = buildThumbnailPath('/photos/2024/vacation/beach.jpg', 'XL');
        expect(result).toBe('/photos/2024/vacation/@eaDir/beach.jpg/SYNOPHOTO_THUMB_XL.jpg');
      });

      it('should handle any custom size string', () => {
        const result = buildThumbnailPath('/photos/image.jpg', 'S');
        expect(result).toBe('/photos/@eaDir/image.jpg/SYNOPHOTO_THUMB_S.jpg');
      });
    });

    describe('path edge cases', () => {
      it('should handle root-level files', () => {
        const result = buildThumbnailPath('/image.jpg', 'M');
        expect(result).toBe('/@eaDir/image.jpg/SYNOPHOTO_THUMB_M.jpg');
      });

      it('should handle deeply nested paths', () => {
        const result = buildThumbnailPath('/photos/2024/01/january/family/dinner.jpg', 'XL');
        expect(result).toBe('/photos/2024/01/january/family/@eaDir/dinner.jpg/SYNOPHOTO_THUMB_XL.jpg');
      });

      it('should handle filenames with spaces', () => {
        const result = buildThumbnailPath('/photos/my photo.jpg', 'M');
        expect(result).toBe('/photos/@eaDir/my photo.jpg/SYNOPHOTO_THUMB_M.jpg');
      });

      it('should handle filenames with special characters', () => {
        const result = buildThumbnailPath('/photos/image-2024_01.jpg', 'M');
        expect(result).toBe('/photos/@eaDir/image-2024_01.jpg/SYNOPHOTO_THUMB_M.jpg');
      });
    });
  });

  describe('qualityLevel - Quality Level Mapping', () => {
    describe('valid quality strings', () => {
      it('should return 1 for M quality', () => {
        expect(qualityLevel('M')).toBe(1);
      });

      it('should return 2 for XL quality', () => {
        expect(qualityLevel('XL')).toBe(2);
      });

      it('should return 3 for original quality', () => {
        expect(qualityLevel('original')).toBe(3);
      });
    });

    describe('invalid quality strings', () => {
      it('should return 0 for empty string', () => {
        expect(qualityLevel('')).toBe(0);
      });

      it('should return 0 for null', () => {
        expect(qualityLevel(null)).toBe(0);
      });

      it('should return 0 for undefined', () => {
        expect(qualityLevel(undefined)).toBe(0);
      });

      it('should return 0 for unknown quality', () => {
        expect(qualityLevel('unknown')).toBe(0);
        expect(qualityLevel('S')).toBe(0);
        expect(qualityLevel('L')).toBe(0);
      });

      it('should return 0 for case-sensitive mismatch', () => {
        expect(qualityLevel('m')).toBe(0);
        expect(qualityLevel('xl')).toBe(0);
        expect(qualityLevel('Original')).toBe(0);
      });
    });

    describe('quality ordering', () => {
      it('should maintain M < XL < original ordering', () => {
        expect(qualityLevel('M')).toBeLessThan(qualityLevel('XL'));
        expect(qualityLevel('XL')).toBeLessThan(qualityLevel('original'));
      });
    });
  });

  describe('shouldSkipUpgrade - Upgrade Skip Logic', () => {
    describe('should skip upgrade', () => {
      it('should skip when already at target quality', () => {
        expect(shouldSkipUpgrade('XL', 'XL')).toBe(true);
        expect(shouldSkipUpgrade('M', 'M')).toBe(true);
        expect(shouldSkipUpgrade('original', 'original')).toBe(true);
      });

      it('should skip when already at higher quality', () => {
        expect(shouldSkipUpgrade('XL', 'M')).toBe(true);
        expect(shouldSkipUpgrade('original', 'XL')).toBe(true);
        expect(shouldSkipUpgrade('original', 'M')).toBe(true);
      });
    });

    describe('should not skip upgrade', () => {
      it('should not skip when upgrading to higher quality', () => {
        expect(shouldSkipUpgrade('M', 'XL')).toBe(false);
        expect(shouldSkipUpgrade('M', 'original')).toBe(false);
        expect(shouldSkipUpgrade('XL', 'original')).toBe(false);
      });

      it('should not skip when current quality is unknown', () => {
        expect(shouldSkipUpgrade('unknown', 'XL')).toBe(false);
        expect(shouldSkipUpgrade(null, 'M')).toBe(false);
        expect(shouldSkipUpgrade(undefined, 'XL')).toBe(false);
      });
    });
  });

  describe('delay - Promise-based Delay', () => {
    it('should resolve after specified delay', async () => {
      const start = Date.now();
      await delay(50);
      const elapsed = Date.now() - start;
      // Allow some tolerance for timing variations
      expect(elapsed).toBeGreaterThanOrEqual(40);
      expect(elapsed).toBeLessThan(150);
    });

    it('should resolve with undefined', async () => {
      const result = await delay(10);
      expect(result).toBeUndefined();
    });

    it('should handle 0ms delay', async () => {
      const start = Date.now();
      await delay(0);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('loadPhotosInBatches - Batch Loading', () => {
    let mockPreloader;
    let loadOrder;

    beforeEach(() => {
      loadOrder = [];
      mockPreloader = vi.fn().mockImplementation((photo, quality) => {
        loadOrder.push(photo.id);
        return Promise.resolve({
          value: photo,
          result: { loaded: true },
          quality: quality,
          originalFilePath: photo.file
        });
      });
    });

    describe('batching behavior', () => {
      it('should split photos into correct number of batches', async () => {
        const photos = [
          { id: 1, file: '/photo1.jpg' },
          { id: 2, file: '/photo2.jpg' },
          { id: 3, file: '/photo3.jpg' },
          { id: 4, file: '/photo4.jpg' },
          { id: 5, file: '/photo5.jpg' }
        ];

        await loadPhotosInBatches(photos, 'M', 2, mockPreloader);

        // 5 photos with batch size 2 = 3 batches (2, 2, 1)
        expect(mockPreloader).toHaveBeenCalledTimes(5);
      });

      it('should return all results in order', async () => {
        const photos = [
          { id: 1, file: '/photo1.jpg' },
          { id: 2, file: '/photo2.jpg' },
          { id: 3, file: '/photo3.jpg' }
        ];

        const results = await loadPhotosInBatches(photos, 'XL', 2, mockPreloader);

        expect(results).toHaveLength(3);
        expect(results[0].value.id).toBe(1);
        expect(results[1].value.id).toBe(2);
        expect(results[2].value.id).toBe(3);
      });

      it('should pass correct quality to preloader', async () => {
        const photos = [{ id: 1, file: '/photo1.jpg' }];

        await loadPhotosInBatches(photos, 'M', 1, mockPreloader);

        expect(mockPreloader).toHaveBeenCalledWith(
          expect.objectContaining({ id: 1 }),
          'M'
        );
      });
    });

    describe('batch processing order', () => {
      it('should process batches sequentially', async () => {
        let batchOrder = [];

        const trackingPreloader = vi.fn().mockImplementation((photo) => {
          const batch = Math.floor((photo.id - 1) / 2);
          batchOrder.push({ photoId: photo.id, batchNumber: batch });
          return Promise.resolve({
            value: photo,
            result: { loaded: true },
            quality: 'M'
          });
        });

        const photos = [
          { id: 1, file: '/photo1.jpg' },
          { id: 2, file: '/photo2.jpg' },
          { id: 3, file: '/photo3.jpg' },
          { id: 4, file: '/photo4.jpg' }
        ];

        await loadPhotosInBatches(photos, 'M', 2, trackingPreloader);

        // First two photos should be in batch 0, next two in batch 1
        expect(batchOrder[0].batchNumber).toBe(0);
        expect(batchOrder[1].batchNumber).toBe(0);
        expect(batchOrder[2].batchNumber).toBe(1);
        expect(batchOrder[3].batchNumber).toBe(1);
      });
    });

    describe('edge cases', () => {
      it('should handle empty photo array', async () => {
        const results = await loadPhotosInBatches([], 'M', 5, mockPreloader);

        expect(results).toHaveLength(0);
        expect(mockPreloader).not.toHaveBeenCalled();
      });

      it('should handle single photo', async () => {
        const photos = [{ id: 1, file: '/photo1.jpg' }];

        const results = await loadPhotosInBatches(photos, 'M', 5, mockPreloader);

        expect(results).toHaveLength(1);
        expect(mockPreloader).toHaveBeenCalledTimes(1);
      });

      it('should handle batch size larger than photo count', async () => {
        const photos = [
          { id: 1, file: '/photo1.jpg' },
          { id: 2, file: '/photo2.jpg' }
        ];

        const results = await loadPhotosInBatches(photos, 'M', 10, mockPreloader);

        expect(results).toHaveLength(2);
        expect(mockPreloader).toHaveBeenCalledTimes(2);
      });

      it('should handle batch size of 1', async () => {
        const photos = [
          { id: 1, file: '/photo1.jpg' },
          { id: 2, file: '/photo2.jpg' },
          { id: 3, file: '/photo3.jpg' }
        ];

        const results = await loadPhotosInBatches(photos, 'M', 1, mockPreloader);

        expect(results).toHaveLength(3);
        expect(mockPreloader).toHaveBeenCalledTimes(3);
      });

      it('should handle preloader failures gracefully', async () => {
        const failingPreloader = vi.fn()
          .mockResolvedValueOnce({ value: { id: 1 }, result: { loaded: true } })
          .mockResolvedValueOnce({ value: { id: 2 }, result: { loaded: false } })
          .mockResolvedValueOnce({ value: { id: 3 }, result: { loaded: true } });

        const photos = [
          { id: 1, file: '/photo1.jpg' },
          { id: 2, file: '/photo2.jpg' },
          { id: 3, file: '/photo3.jpg' }
        ];

        const results = await loadPhotosInBatches(photos, 'M', 1, failingPreloader);

        // All results returned, including failed loads
        expect(results).toHaveLength(3);
        expect(results[0].result.loaded).toBe(true);
        expect(results[1].result.loaded).toBe(false);
        expect(results[2].result.loaded).toBe(true);
      });
    });
  });

  describe('upgradeImageQuality - Quality Upgrade Logic', () => {
    /**
     * Mock version of upgradeImageQuality that tests the core logic
     * without requiring jQuery/DOM. This simulates the function's behavior.
     */
    let upgradesPaused;
    let mockPreloader;
    let mockImgBox;

    beforeEach(() => {
      upgradesPaused = false;
      mockPreloader = vi.fn();
      mockImgBox = {
        currentQuality: 'M',
        originalFilePath: '/photos/test.jpg',
        imgSrc: '/photos/@eaDir/test.jpg/SYNOPHOTO_THUMB_M.jpg',
        data: function(key, value) {
          if (value === undefined) {
            if (key === 'quality-level') return this.currentQuality;
            if (key === 'original-file-path') return this.originalFilePath;
          } else {
            if (key === 'quality-level') this.currentQuality = value;
          }
        },
        setImgSrc: function(src) { this.imgSrc = src; }
      };
    });

    /**
     * Simulates upgradeImageQuality logic for testing
     */
    async function upgradeImageQualityMock($imgBox, targetQuality, isPaused, preloader) {
      // Check if upgrades are paused
      if (isPaused) {
        return { upgraded: false, reason: 'paused' };
      }

      // Get current quality level
      const currentQuality = $imgBox.data('quality-level') || 'M';
      const currentLevel = qualityLevel(currentQuality);
      const targetLevel = qualityLevel(targetQuality);

      // Skip if already at target quality or higher
      if (currentLevel >= targetLevel) {
        return { upgraded: false, reason: 'already-at-target' };
      }

      // Get original file path
      const originalFilePath = $imgBox.data('original-file-path');
      if (!originalFilePath) {
        return { upgraded: false, reason: 'no-file-path' };
      }

      // Simulate preload
      const result = await preloader(originalFilePath, targetQuality);
      if (!result.loaded) {
        return { upgraded: false, reason: 'load-failed' };
      }

      // Update the image
      $imgBox.setImgSrc(result.src);
      $imgBox.data('quality-level', targetQuality);

      return { upgraded: true };
    }

    describe('upgradesPaused behavior', () => {
      it('should return early when upgradesPaused is true', async () => {
        mockPreloader.mockResolvedValue({ loaded: true, src: '/new-src.jpg' });

        const result = await upgradeImageQualityMock(
          mockImgBox,
          'XL',
          true,  // paused
          mockPreloader
        );

        expect(result.upgraded).toBe(false);
        expect(result.reason).toBe('paused');
        expect(mockPreloader).not.toHaveBeenCalled();
        expect(mockImgBox.currentQuality).toBe('M');  // Quality unchanged
      });

      it('should proceed with upgrade when upgradesPaused is false', async () => {
        mockPreloader.mockResolvedValue({ loaded: true, src: '/photos/@eaDir/test.jpg/SYNOPHOTO_THUMB_XL.jpg' });

        const result = await upgradeImageQualityMock(
          mockImgBox,
          'XL',
          false,  // not paused
          mockPreloader
        );

        expect(result.upgraded).toBe(true);
        expect(mockPreloader).toHaveBeenCalled();
        expect(mockImgBox.currentQuality).toBe('XL');  // Quality updated
      });
    });

    describe('quality level checking', () => {
      it('should skip upgrade if already at target quality', async () => {
        mockImgBox.currentQuality = 'XL';
        mockPreloader.mockResolvedValue({ loaded: true, src: '/new-src.jpg' });

        const result = await upgradeImageQualityMock(
          mockImgBox,
          'XL',
          false,
          mockPreloader
        );

        expect(result.upgraded).toBe(false);
        expect(result.reason).toBe('already-at-target');
        expect(mockPreloader).not.toHaveBeenCalled();
      });

      it('should skip upgrade if already at higher quality', async () => {
        mockImgBox.currentQuality = 'original';
        mockPreloader.mockResolvedValue({ loaded: true, src: '/new-src.jpg' });

        const result = await upgradeImageQualityMock(
          mockImgBox,
          'XL',
          false,
          mockPreloader
        );

        expect(result.upgraded).toBe(false);
        expect(result.reason).toBe('already-at-target');
        expect(mockPreloader).not.toHaveBeenCalled();
      });
    });

    describe('data attribute updates', () => {
      it('should update quality-level attribute when upgrade succeeds', async () => {
        mockPreloader.mockResolvedValue({ loaded: true, src: '/photos/@eaDir/test.jpg/SYNOPHOTO_THUMB_XL.jpg' });
        expect(mockImgBox.currentQuality).toBe('M');

        await upgradeImageQualityMock(mockImgBox, 'XL', false, mockPreloader);

        expect(mockImgBox.currentQuality).toBe('XL');
      });

      it('should update img src when upgrade succeeds', async () => {
        const newSrc = '/photos/@eaDir/test.jpg/SYNOPHOTO_THUMB_XL.jpg';
        mockPreloader.mockResolvedValue({ loaded: true, src: newSrc });

        await upgradeImageQualityMock(mockImgBox, 'XL', false, mockPreloader);

        expect(mockImgBox.imgSrc).toBe(newSrc);
      });

      it('should not update attributes when preload fails', async () => {
        mockPreloader.mockResolvedValue({ loaded: false, src: null });
        const originalSrc = mockImgBox.imgSrc;

        const result = await upgradeImageQualityMock(mockImgBox, 'XL', false, mockPreloader);

        expect(result.upgraded).toBe(false);
        expect(result.reason).toBe('load-failed');
        expect(mockImgBox.currentQuality).toBe('M');  // Unchanged
        expect(mockImgBox.imgSrc).toBe(originalSrc);  // Unchanged
      });
    });

    describe('missing file path handling', () => {
      it('should return early when original-file-path is missing', async () => {
        mockImgBox.originalFilePath = null;
        mockPreloader.mockResolvedValue({ loaded: true, src: '/new-src.jpg' });

        const result = await upgradeImageQualityMock(mockImgBox, 'XL', false, mockPreloader);

        expect(result.upgraded).toBe(false);
        expect(result.reason).toBe('no-file-path');
        expect(mockPreloader).not.toHaveBeenCalled();
      });
    });
  });

  describe('Integration scenarios', () => {
    it('should support typical progressive loading workflow', async () => {
      // Simulate the full progressive loading workflow
      const photos = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        file: `/photos/photo${i + 1}.jpg`
      }));

      const mockPreloader = vi.fn().mockImplementation((photo, quality) => {
        return Promise.resolve({
          value: photo,
          result: { loaded: true },
          quality: quality,
          originalFilePath: photo.file
        });
      });

      // Stage 1: Load first 15 with M quality
      const initialBatch = photos.slice(0, INITIAL_BATCH_SIZE);
      const stage1Results = await loadPhotosInBatches(
        initialBatch,
        INITIAL_QUALITY,
        LOAD_BATCH_SIZE,
        mockPreloader
      );

      expect(stage1Results).toHaveLength(15);
      expect(stage1Results.every(r => r.quality === 'M')).toBe(true);

      // Stage 2: Load remaining 10 with M quality
      const remainingBatch = photos.slice(INITIAL_BATCH_SIZE);
      const stage2Results = await loadPhotosInBatches(
        remainingBatch,
        INITIAL_QUALITY,
        LOAD_BATCH_SIZE,
        mockPreloader
      );

      expect(stage2Results).toHaveLength(10);
      expect(stage2Results.every(r => r.quality === 'M')).toBe(true);

      // Verify total calls
      expect(mockPreloader).toHaveBeenCalledTimes(25);
    });

    it('should correctly determine upgrade paths', () => {
      // M -> XL: should upgrade
      expect(shouldSkipUpgrade('M', 'XL')).toBe(false);

      // M -> original: should upgrade
      expect(shouldSkipUpgrade('M', 'original')).toBe(false);

      // XL -> original: should upgrade
      expect(shouldSkipUpgrade('XL', 'original')).toBe(false);

      // Already at XL: should skip
      expect(shouldSkipUpgrade('XL', 'XL')).toBe(true);

      // XL -> M: should skip (don't downgrade)
      expect(shouldSkipUpgrade('XL', 'M')).toBe(true);
    });
  });
});
