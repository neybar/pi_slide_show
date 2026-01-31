import { describe, it, expect } from 'vitest';
import { PANORAMA_ASPECT_THRESHOLD } from '../../www/js/config.mjs';

/**
 * Pure function version of calculatePanoramaColumns from www/js/main.js
 * This extracts the core logic for testability without jQuery dependency.
 * Configuration constants are imported from www/js/config.mjs (shared with main.js)
 *
 * @param {number} imageRatio - The aspect ratio of the panorama image (width/height)
 * @param {number} totalColumns - Total columns in the grid (e.g., 5 for wide, 4 for normal)
 * @param {number} viewportWidth - Viewport width in pixels
 * @param {number} viewportHeight - Viewport height in pixels (full height, will be halved for row)
 * @returns {number} Number of columns the panorama should span
 */
function calculatePanoramaColumns(imageRatio, totalColumns, viewportWidth, viewportHeight) {
  // Each row is half the viewport height
  const rowHeight = viewportHeight / 2;

  // Guard against division by zero (edge case: minimized window)
  if (rowHeight <= 0) {
    return Math.max(2, totalColumns - 1);
  }

  const cellWidth = viewportWidth / totalColumns;
  const cellRatio = cellWidth / rowHeight;

  // Calculate columns needed for panorama to fill vertical space
  const columnsNeeded = Math.ceil(imageRatio / cellRatio);

  // Clamp result between 2 and (totalColumns - 1) to leave room for a portrait
  return Math.max(2, Math.min(columnsNeeded, totalColumns - 1));
}

/**
 * Determines if an image should be classified as a panorama based on aspect ratio.
 * Uses PANORAMA_ASPECT_THRESHOLD from shared config.
 *
 * @param {number} aspectRatio - The aspect ratio of the image (width/height)
 * @returns {boolean} True if the image is a panorama
 */
function isPanorama(aspectRatio) {
  return aspectRatio > PANORAMA_ASPECT_THRESHOLD;
}

describe('Panorama Functions', () => {
  describe('calculatePanoramaColumns', () => {
    // Standard test viewport: 1920x1080 (common HD resolution)
    const standardViewport = { width: 1920, height: 1080 };

    describe('2:1 ratio with 5 columns', () => {
      it('should return 3 columns for 2:1 ratio in standard viewport', () => {
        // 2:1 panorama in 1920x1080 viewport with 5 columns
        // Row height = 1080/2 = 540px
        // Cell width = 1920/5 = 384px
        // Cell ratio = 384/540 = 0.711
        // Columns needed = ceil(2 / 0.711) = ceil(2.81) = 3
        const result = calculatePanoramaColumns(2.0, 5, standardViewport.width, standardViewport.height);
        expect(result).toBe(3);
      });

      it('should return at least 2 columns even for narrow viewports', () => {
        // Very tall viewport where cell ratio is high
        const result = calculatePanoramaColumns(2.0, 5, 1000, 2000);
        expect(result).toBeGreaterThanOrEqual(2);
      });
    });

    describe('3:1 ratio with 5 columns', () => {
      it('should return 4 columns for 3:1 ratio in standard viewport (leaving room for portrait)', () => {
        // 3:1 panorama in 1920x1080 viewport with 5 columns
        // Cell ratio = 0.711
        // Columns needed = ceil(3 / 0.711) = ceil(4.22) = 5, but clamped to 4 (totalColumns - 1)
        const result = calculatePanoramaColumns(3.0, 5, standardViewport.width, standardViewport.height);
        expect(result).toBe(4);
      });

      it('should handle 3:1 ratio with 4 columns (normal mode)', () => {
        // 3:1 panorama with 4 columns, clamped to 3 (totalColumns - 1)
        const result = calculatePanoramaColumns(3.0, 4, standardViewport.width, standardViewport.height);
        expect(result).toBe(3);
      });
    });

    describe('4:1+ ratio returns max columns minus 1 (to leave room for portrait)', () => {
      it('should clamp to totalColumns-1 for very wide panoramas (4:1)', () => {
        const result = calculatePanoramaColumns(4.0, 5, standardViewport.width, standardViewport.height);
        expect(result).toBe(4); // 5 - 1 = 4
      });

      it('should clamp to totalColumns-1 for extremely wide panoramas (6:1)', () => {
        const result = calculatePanoramaColumns(6.0, 5, standardViewport.width, standardViewport.height);
        expect(result).toBe(4); // 5 - 1 = 4
      });

      it('should clamp to 3 columns in normal mode for 4:1 ratio', () => {
        const result = calculatePanoramaColumns(4.0, 4, standardViewport.width, standardViewport.height);
        expect(result).toBe(3); // 4 - 1 = 3
      });
    });

    describe('result is always between 2 and totalColumns-1', () => {
      it('should never return less than 2 columns', () => {
        // Even a 2:1 panorama should span at least 2 columns
        const testCases = [
          { ratio: 2.0, columns: 5, width: 500, height: 200 },
          { ratio: 2.1, columns: 4, width: 800, height: 600 },
          { ratio: 2.5, columns: 4, width: 1024, height: 768 },
        ];

        for (const tc of testCases) {
          const result = calculatePanoramaColumns(tc.ratio, tc.columns, tc.width, tc.height);
          expect(result).toBeGreaterThanOrEqual(2);
        }
      });

      it('should never return more than totalColumns-1 (leaves room for portrait)', () => {
        const testCases = [
          { ratio: 10.0, columns: 5 },
          { ratio: 8.0, columns: 4 },
          { ratio: 20.0, columns: 6 },
        ];

        for (const tc of testCases) {
          const result = calculatePanoramaColumns(tc.ratio, tc.columns, standardViewport.width, standardViewport.height);
          expect(result).toBeLessThanOrEqual(tc.columns - 1);
        }
      });

      it('should handle edge case where totalColumns is 3 (min 2, max 2)', () => {
        // With 3 columns, max is 3-1=2, min is 2, so result is always 2
        const result = calculatePanoramaColumns(5.0, 3, standardViewport.width, standardViewport.height);
        expect(result).toBe(2);
      });

      it('should handle various viewport sizes', () => {
        const viewports = [
          { width: 1280, height: 720 },   // 720p
          { width: 1920, height: 1080 },  // 1080p
          { width: 2560, height: 1440 },  // 1440p
          { width: 3840, height: 2160 },  // 4K
          { width: 800, height: 600 },    // Small
        ];

        for (const vp of viewports) {
          for (let columns = 3; columns <= 6; columns++) {
            const result = calculatePanoramaColumns(3.0, columns, vp.width, vp.height);
            expect(result).toBeGreaterThanOrEqual(2);
            expect(result).toBeLessThanOrEqual(columns - 1);
          }
        }
      });
    });

    describe('column calculation accuracy', () => {
      it('should calculate correctly for 16:9 viewport with 5 columns', () => {
        // 16:9 viewport (1920x1080)
        // Row height = 540
        // Cell width = 384
        // Cell ratio = 384/540 ≈ 0.711

        // For 2.5:1 panorama: columns = ceil(2.5 / 0.711) = ceil(3.52) = 4
        const result = calculatePanoramaColumns(2.5, 5, 1920, 1080);
        expect(result).toBe(4);
      });

      it('should calculate correctly for 4:3 viewport with 4 columns', () => {
        // 4:3 viewport (1024x768)
        // Row height = 384
        // Cell width = 256
        // Cell ratio = 256/384 ≈ 0.667

        // For 2:1 panorama: columns = ceil(2 / 0.667) = ceil(3.0) = 3
        const result = calculatePanoramaColumns(2.0, 4, 1024, 768);
        expect(result).toBe(3);
      });
    });

    describe('edge cases', () => {
      it('should handle zero viewport height (division by zero guard)', () => {
        // Edge case: minimized window with 0 height
        const result = calculatePanoramaColumns(3.0, 5, 1920, 0);
        expect(result).toBe(4); // max(2, 5-1) = 4
      });

      it('should handle negative viewport height', () => {
        // Edge case: negative height (shouldn't happen but guard against it)
        const result = calculatePanoramaColumns(3.0, 4, 1920, -100);
        expect(result).toBe(3); // max(2, 4-1) = 3
      });
    });
  });

  describe('isPanorama (aspect ratio > 2.0 detection)', () => {
    it('should detect 2.1:1 ratio as panorama', () => {
      expect(isPanorama(2.1)).toBe(true);
    });

    it('should detect 3:1 ratio as panorama', () => {
      expect(isPanorama(3.0)).toBe(true);
    });

    it('should detect 4:1 ratio as panorama', () => {
      expect(isPanorama(4.0)).toBe(true);
    });

    it('should NOT detect exactly 2:1 ratio as panorama', () => {
      // 2.0 is the threshold, so exactly 2.0 is NOT a panorama
      expect(isPanorama(2.0)).toBe(false);
    });

    it('should NOT detect 1.9:1 ratio as panorama', () => {
      expect(isPanorama(1.9)).toBe(false);
    });

    it('should NOT detect 16:9 (1.78:1) ratio as panorama', () => {
      expect(isPanorama(16 / 9)).toBe(false);
    });

    it('should NOT detect landscape 3:2 (1.5:1) ratio as panorama', () => {
      expect(isPanorama(1.5)).toBe(false);
    });

    it('should NOT detect portrait (0.5:1) ratio as panorama', () => {
      expect(isPanorama(0.5)).toBe(false);
    });

    it('should handle edge case just above threshold', () => {
      expect(isPanorama(2.001)).toBe(true);
    });

    it('should handle edge case just below threshold', () => {
      expect(isPanorama(1.999)).toBe(false);
    });
  });
});
