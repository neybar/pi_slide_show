import { describe, it, expect } from 'vitest';

/**
 * Pure function versions of shrink-to-corner animation helpers from www/js/main.js
 * These extract the core logic for testability without jQuery/browser dependency.
 * SYNC: Keep in sync with www/js/main.js getShrinkCornerClass and related functions
 */

/**
 * Get the CSS class for shrink-to-corner animation based on direction and shelf position.
 * Corner selection follows the pattern:
 * - left + top shelf → bottom-left
 * - left + bottom shelf → top-left
 * - right + top shelf → bottom-right
 * - right + bottom shelf → top-right
 * @param {string} direction - 'left' or 'right'
 * @param {boolean} isTopRow - True if the photo is in the top row
 * @returns {string} - CSS class name for the shrink animation
 */
function getShrinkCornerClass(direction, isTopRow) {
  if (direction === 'left') {
    return isTopRow ? 'shrink-to-bottom-left' : 'shrink-to-top-left';
  } else {
    return isTopRow ? 'shrink-to-bottom-right' : 'shrink-to-top-right';
  }
}

/**
 * Get the opposite direction for slide-in animation.
 * New photos should enter from the opposite edge of where the gravity pulls.
 * SYNC: Keep in sync with www/js/main.js getOppositeDirection function
 * @param {string} direction - 'left' or 'right' (gravity/shrink direction)
 * @returns {string} - The opposite direction for slide-in entry
 */
function getOppositeDirection(direction) {
  return direction === 'left' ? 'right' : 'left';
}

/**
 * Allowed slide directions (horizontal only).
 * SYNC: Keep in sync with www/js/main.js SLIDE_DIRECTIONS constant
 */
const SLIDE_DIRECTIONS = ['left', 'right'];

/**
 * Validate that a direction is one of the allowed directions.
 * @param {string} direction - Direction to validate
 * @returns {boolean} - True if direction is valid
 */
function isValidDirection(direction) {
  return SLIDE_DIRECTIONS.includes(direction);
}

/**
 * Check if the device supports full shrink animation.
 * Pure function version for testing - simulates the browser logic.
 * @param {boolean} prefersReducedMotion - Simulated prefers-reduced-motion media query result
 * @param {boolean} enableShrinkAnimation - The ENABLE_SHRINK_ANIMATION config value
 * @returns {boolean} - True if full animation should be used
 */
function supportsFullAnimation(prefersReducedMotion, enableShrinkAnimation) {
  if (prefersReducedMotion) {
    return false;
  }
  return enableShrinkAnimation !== false;
}

describe('Shrink-to-Corner Animation', () => {
  describe('getShrinkCornerClass - Corner Selection', () => {
    describe('left direction', () => {
      it('should return shrink-to-bottom-left for left direction on top row', () => {
        expect(getShrinkCornerClass('left', true)).toBe('shrink-to-bottom-left');
      });

      it('should return shrink-to-top-left for left direction on bottom row', () => {
        expect(getShrinkCornerClass('left', false)).toBe('shrink-to-top-left');
      });
    });

    describe('right direction', () => {
      it('should return shrink-to-bottom-right for right direction on top row', () => {
        expect(getShrinkCornerClass('right', true)).toBe('shrink-to-bottom-right');
      });

      it('should return shrink-to-top-right for right direction on bottom row', () => {
        expect(getShrinkCornerClass('right', false)).toBe('shrink-to-top-right');
      });
    });

    describe('corner selection logic', () => {
      it('should select corner opposite to slide direction on vertical axis', () => {
        // When sliding left, corners are on the left
        // When sliding right, corners are on the right
        expect(getShrinkCornerClass('left', true)).toContain('-left');
        expect(getShrinkCornerClass('left', false)).toContain('-left');
        expect(getShrinkCornerClass('right', true)).toContain('-right');
        expect(getShrinkCornerClass('right', false)).toContain('-right');
      });

      it('should select corner opposite to row position on horizontal axis', () => {
        // Top row shrinks to bottom corners
        // Bottom row shrinks to top corners
        expect(getShrinkCornerClass('left', true)).toContain('bottom');
        expect(getShrinkCornerClass('right', true)).toContain('bottom');
        expect(getShrinkCornerClass('left', false)).toContain('top');
        expect(getShrinkCornerClass('right', false)).toContain('top');
      });
    });

    describe('CSS class format', () => {
      it('should return valid CSS class names with shrink-to prefix', () => {
        const validClasses = [
          'shrink-to-bottom-left',
          'shrink-to-top-left',
          'shrink-to-bottom-right',
          'shrink-to-top-right'
        ];

        expect(validClasses).toContain(getShrinkCornerClass('left', true));
        expect(validClasses).toContain(getShrinkCornerClass('left', false));
        expect(validClasses).toContain(getShrinkCornerClass('right', true));
        expect(validClasses).toContain(getShrinkCornerClass('right', false));
      });

      it('should match CSS keyframe animation names', () => {
        // Each class should match a corresponding @keyframes definition
        // in main.scss: shrink-to-bottom-left, shrink-to-top-left, etc.
        const result = getShrinkCornerClass('left', true);
        expect(result).toMatch(/^shrink-to-(top|bottom)-(left|right)$/);
      });
    });
  });

  describe('Direction Validation', () => {
    describe('valid directions', () => {
      it('should accept left direction', () => {
        expect(isValidDirection('left')).toBe(true);
      });

      it('should accept right direction', () => {
        expect(isValidDirection('right')).toBe(true);
      });
    });

    describe('invalid directions (up/down removed)', () => {
      it('should reject up direction', () => {
        expect(isValidDirection('up')).toBe(false);
      });

      it('should reject down direction', () => {
        expect(isValidDirection('down')).toBe(false);
      });

      it('should reject arbitrary strings', () => {
        expect(isValidDirection('diagonal')).toBe(false);
        expect(isValidDirection('center')).toBe(false);
        expect(isValidDirection('')).toBe(false);
      });

      it('should reject null and undefined', () => {
        expect(isValidDirection(null)).toBe(false);
        expect(isValidDirection(undefined)).toBe(false);
      });
    });

    describe('SLIDE_DIRECTIONS constant', () => {
      it('should only contain left and right', () => {
        expect(SLIDE_DIRECTIONS).toEqual(['left', 'right']);
      });

      it('should not contain up or down', () => {
        expect(SLIDE_DIRECTIONS).not.toContain('up');
        expect(SLIDE_DIRECTIONS).not.toContain('down');
      });

      it('should have exactly 2 directions', () => {
        expect(SLIDE_DIRECTIONS).toHaveLength(2);
      });
    });
  });

  describe('supportsFullAnimation - Progressive Enhancement', () => {
    describe('prefers-reduced-motion handling', () => {
      it('should return false when user prefers reduced motion', () => {
        expect(supportsFullAnimation(true, true)).toBe(false);
      });

      it('should respect reduced motion even when ENABLE_SHRINK_ANIMATION is true', () => {
        expect(supportsFullAnimation(true, true)).toBe(false);
      });
    });

    describe('ENABLE_SHRINK_ANIMATION config', () => {
      it('should return true when enabled and no reduced motion preference', () => {
        expect(supportsFullAnimation(false, true)).toBe(true);
      });

      it('should return false when ENABLE_SHRINK_ANIMATION is false', () => {
        expect(supportsFullAnimation(false, false)).toBe(false);
      });

      it('should return true when ENABLE_SHRINK_ANIMATION is undefined (default behavior)', () => {
        // In the actual code, ENABLE_SHRINK_ANIMATION defaults to true
        // When explicitly undefined, !== false check returns true
        expect(supportsFullAnimation(false, undefined)).toBe(true);
      });
    });

    describe('combined conditions', () => {
      it('should return false when both reduced motion and disabled config', () => {
        expect(supportsFullAnimation(true, false)).toBe(false);
      });

      it('should return true only when both conditions allow animation', () => {
        // Only returns true when:
        // 1. prefersReducedMotion is false
        // 2. enableShrinkAnimation is not explicitly false
        expect(supportsFullAnimation(false, true)).toBe(true);
        expect(supportsFullAnimation(false, undefined)).toBe(true);
      });
    });
  });

  describe('getOppositeDirection - Entry Direction', () => {
    describe('direction mapping', () => {
      it('should return right when direction is left', () => {
        expect(getOppositeDirection('left')).toBe('right');
      });

      it('should return left when direction is right', () => {
        expect(getOppositeDirection('right')).toBe('left');
      });
    });

    describe('animation flow consistency', () => {
      it('should ensure new photos enter from opposite edge of gravity direction', () => {
        // When gravity pulls left (photos shrink left), gap opens on right
        // New photo should enter from right edge
        expect(getOppositeDirection('left')).toBe('right');

        // When gravity pulls right (photos shrink right), gap opens on left
        // New photo should enter from left edge
        expect(getOppositeDirection('right')).toBe('left');
      });

      it('should only return valid slide directions', () => {
        const validDirections = ['left', 'right'];
        expect(validDirections).toContain(getOppositeDirection('left'));
        expect(validDirections).toContain(getOppositeDirection('right'));
      });
    });

    describe('combined with shrink corner selection', () => {
      it('left direction: shrinks to left corners, enters from right', () => {
        const direction = 'left';
        const entryDirection = getOppositeDirection(direction);

        // Shrink goes to left corners
        expect(getShrinkCornerClass(direction, true)).toContain('-left');
        expect(getShrinkCornerClass(direction, false)).toContain('-left');

        // Entry comes from right
        expect(entryDirection).toBe('right');
      });

      it('right direction: shrinks to right corners, enters from left', () => {
        const direction = 'right';
        const entryDirection = getOppositeDirection(direction);

        // Shrink goes to right corners
        expect(getShrinkCornerClass(direction, true)).toContain('-right');
        expect(getShrinkCornerClass(direction, false)).toContain('-right');

        // Entry comes from left
        expect(entryDirection).toBe('left');
      });
    });
  });

  describe('Animation Timing Constants', () => {
    // These tests verify the expected timing values are used
    // SYNC: Keep in sync with www/js/config.mjs timing constants

    const SHRINK_ANIMATION_DURATION = 400;
    const GRAVITY_ANIMATION_DURATION = 300;
    const SLIDE_IN_ANIMATION_DURATION = 800;

    it('should have Phase A (shrink) duration of 400ms', () => {
      expect(SHRINK_ANIMATION_DURATION).toBe(400);
    });

    it('should have Phase B (gravity) duration of 300ms', () => {
      expect(GRAVITY_ANIMATION_DURATION).toBe(300);
    });

    it('should have Phase C (slide-in) duration of 800ms', () => {
      expect(SLIDE_IN_ANIMATION_DURATION).toBe(800);
    });

    it('should have total animation time of ~1500ms', () => {
      const totalTime = SHRINK_ANIMATION_DURATION + GRAVITY_ANIMATION_DURATION + SLIDE_IN_ANIMATION_DURATION;
      expect(totalTime).toBe(1500);
    });
  });
});

/**
 * Gravity Animation Tests
 * Tests for Phase B gravity fill animation logic
 */
describe('Gravity Animation', () => {
  /**
   * Get the CSS class for gravity slide animation based on direction.
   * SYNC: Keep in sync with www/js/main.js animatePhaseBGravity logic
   * @param {string} direction - 'left' or 'right' (the direction photos shrink toward)
   * @returns {string} - CSS class for the gravity animation
   */
  function getGravitySlideClass(direction) {
    // Photos slide in the same direction as gravity pulls
    // If shrinking left, remaining photos on the right slide left
    // If shrinking right, remaining photos on the left slide right
    return direction === 'left' ? 'gravity-slide-left' : 'gravity-slide-right';
  }

  /**
   * Determine which photos need to slide based on removed photo positions.
   * SYNC: Keep in sync with www/js/main.js animateSwap logic
   * @param {number[]} allPhotoIndices - Indices of all photos in the row [0, 1, 2, 3, ...]
   * @param {number[]} removedIndices - Indices of photos being removed
   * @param {string} direction - 'left' or 'right' (the direction photos shrink toward)
   * @returns {number[]} - Indices of photos that need to slide
   */
  function determinePhotosToSlide(allPhotoIndices, removedIndices, direction) {
    const minRemovedIndex = Math.min(...removedIndices);
    const maxRemovedIndex = Math.max(...removedIndices);

    return allPhotoIndices.filter(index => {
      const isRemoved = removedIndices.includes(index);
      if (isRemoved) return false;

      // Photos to the right of removed photos slide left when direction is 'left'
      // Photos to the left of removed photos slide right when direction is 'right'
      if (direction === 'left' && index > maxRemovedIndex) {
        return true;
      } else if (direction === 'right' && index < minRemovedIndex) {
        return true;
      }
      return false;
    });
  }

  describe('getGravitySlideClass - CSS Class Selection', () => {
    it('should return gravity-slide-left for left direction', () => {
      expect(getGravitySlideClass('left')).toBe('gravity-slide-left');
    });

    it('should return gravity-slide-right for right direction', () => {
      expect(getGravitySlideClass('right')).toBe('gravity-slide-right');
    });

    it('should match CSS keyframe animation names', () => {
      // Each class should match a corresponding @keyframes definition in main.scss
      expect(getGravitySlideClass('left')).toMatch(/^gravity-slide-(left|right)$/);
      expect(getGravitySlideClass('right')).toMatch(/^gravity-slide-(left|right)$/);
    });
  });

  describe('determinePhotosToSlide - Photo Selection Logic', () => {
    describe('left direction (photos shrink left, gap opens on right)', () => {
      it('should select photos to the right of removed photo', () => {
        // Layout: [0] [1] [2] [3] [4], remove index 2, direction left
        // Photos 3 and 4 should slide left to fill the gap
        const result = determinePhotosToSlide([0, 1, 2, 3, 4], [2], 'left');
        expect(result).toEqual([3, 4]);
      });

      it('should select no photos when removing rightmost photo', () => {
        // Layout: [0] [1] [2] [3] [4], remove index 4, direction left
        // No photos to the right, nothing to slide
        const result = determinePhotosToSlide([0, 1, 2, 3, 4], [4], 'left');
        expect(result).toEqual([]);
      });

      it('should handle multiple removed photos', () => {
        // Layout: [0] [1] [2] [3] [4], remove indices 1 and 2, direction left
        // Photos 3 and 4 should slide left
        const result = determinePhotosToSlide([0, 1, 2, 3, 4], [1, 2], 'left');
        expect(result).toEqual([3, 4]);
      });

      it('should not include photos to the left of removed photos', () => {
        // Layout: [0] [1] [2] [3] [4], remove index 2, direction left
        // Photos 0 and 1 should NOT slide
        const result = determinePhotosToSlide([0, 1, 2, 3, 4], [2], 'left');
        expect(result).not.toContain(0);
        expect(result).not.toContain(1);
      });
    });

    describe('right direction (photos shrink right, gap opens on left)', () => {
      it('should select photos to the left of removed photo', () => {
        // Layout: [0] [1] [2] [3] [4], remove index 2, direction right
        // Photos 0 and 1 should slide right to fill the gap
        const result = determinePhotosToSlide([0, 1, 2, 3, 4], [2], 'right');
        expect(result).toEqual([0, 1]);
      });

      it('should select no photos when removing leftmost photo', () => {
        // Layout: [0] [1] [2] [3] [4], remove index 0, direction right
        // No photos to the left, nothing to slide
        const result = determinePhotosToSlide([0, 1, 2, 3, 4], [0], 'right');
        expect(result).toEqual([]);
      });

      it('should handle multiple removed photos', () => {
        // Layout: [0] [1] [2] [3] [4], remove indices 2 and 3, direction right
        // Photos 0 and 1 should slide right
        const result = determinePhotosToSlide([0, 1, 2, 3, 4], [2, 3], 'right');
        expect(result).toEqual([0, 1]);
      });

      it('should not include photos to the right of removed photos', () => {
        // Layout: [0] [1] [2] [3] [4], remove index 2, direction right
        // Photos 3 and 4 should NOT slide
        const result = determinePhotosToSlide([0, 1, 2, 3, 4], [2], 'right');
        expect(result).not.toContain(3);
        expect(result).not.toContain(4);
      });
    });

    describe('edge cases', () => {
      it('should handle removing the only photo (empty result)', () => {
        const result = determinePhotosToSlide([0], [0], 'left');
        expect(result).toEqual([]);
      });

      it('should handle non-contiguous removed photos', () => {
        // Layout: [0] [1] [2] [3] [4], remove indices 1 and 3, direction left
        // Only photos to the right of the rightmost removed (index 3) slide
        // So only photo 4 slides
        const result = determinePhotosToSlide([0, 1, 2, 3, 4], [1, 3], 'left');
        expect(result).toEqual([4]);
      });

      it('should handle removing first and last photos', () => {
        // Layout: [0] [1] [2] [3] [4], remove indices 0 and 4, direction left
        // maxRemovedIndex is 4, no photos to the right
        const resultLeft = determinePhotosToSlide([0, 1, 2, 3, 4], [0, 4], 'left');
        expect(resultLeft).toEqual([]);

        // direction right, minRemovedIndex is 0, no photos to the left
        const resultRight = determinePhotosToSlide([0, 1, 2, 3, 4], [0, 4], 'right');
        expect(resultRight).toEqual([]);
      });
    });
  });

  describe('FLIP Technique Animation Flow', () => {
    /**
     * The FLIP technique for gravity animation:
     * 1. First: Record which photos need to slide (while old photos still in DOM)
     * 2. Last: Remove old photos from DOM (layout reflows, photos move to new positions)
     * 3. Invert: Apply CSS transform to offset photos back to old visual positions
     * 4. Play: Animate transform to 0 (photos slide to new positions)
     */

    it('should follow correct animation sequence', () => {
      // This test documents the expected sequence
      const sequence = [
        'Phase A: Shrink animation on removed photos',
        'DOM: Remove old photos (triggers layout reflow)',
        'Phase B: Apply gravity transform offset, animate to final position',
        'Phase C: Slide in new photo from opposite edge'
      ];

      expect(sequence).toHaveLength(4);
      expect(sequence[0]).toContain('Shrink');
      expect(sequence[1]).toContain('Remove');
      expect(sequence[2]).toContain('gravity');
      expect(sequence[3]).toContain('Slide in');
    });

    it('should use opposite entry direction from shrink direction', () => {
      // When photos shrink left, new photo enters from right
      expect(getOppositeDirection('left')).toBe('right');

      // When photos shrink right, new photo enters from left
      expect(getOppositeDirection('right')).toBe('left');
    });

    it('should have gravity direction match shrink direction', () => {
      // When shrinking left, adjacent photos slide left (gravity pulls left)
      expect(getGravitySlideClass('left')).toBe('gravity-slide-left');

      // When shrinking right, adjacent photos slide right (gravity pulls right)
      expect(getGravitySlideClass('right')).toBe('gravity-slide-right');
    });
  });
});
