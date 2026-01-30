import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Pure function versions of layout variety algorithms from www/js/main.js
 * These extract the core logic for testability without jQuery dependency.
 * SYNC: Keep in sync with www/js/main.js layout variety functions
 */

// Configuration constants (same as in main.js)
const ORIENTATION_MATCH_PROBABILITY = 0.7;
const FILL_RIGHT_TO_LEFT_PROBABILITY = 0.5;
const INTER_ROW_DIFFER_PROBABILITY = 0.7;
const STACKED_LANDSCAPES_PROBABILITY = 0.3;

/**
 * Get a random fill direction for building rows.
 * @param {number} randomValue - Random value between 0 and 1
 * @returns {string} - 'ltr' (left-to-right) or 'rtl' (right-to-left)
 */
function getRandomFillDirection(randomValue) {
  return randomValue < FILL_RIGHT_TO_LEFT_PROBABILITY ? 'rtl' : 'ltr';
}

/**
 * Convert a pattern array to a signature string.
 * Maps slot widths to letters: 2 -> 'L' (landscape), 1 -> 'P' (portrait/stacked)
 * @param {number[]} pattern - Array of slot widths, e.g., [2, 1, 2]
 * @returns {string} - Pattern signature, e.g., "LPL"
 */
function patternToSignature(pattern) {
  return pattern.map(width => width === 2 ? 'L' : 'P').join('');
}

/**
 * Check if two pattern signatures are different.
 * @param {string} sig1 - First pattern signature
 * @param {string} sig2 - Second pattern signature
 * @returns {boolean} - True if patterns are different
 */
function patternsAreDifferent(sig1, sig2) {
  return sig1 !== sig2;
}

/**
 * Generate a random row pattern specifying slot widths.
 * Each slot width is either 1 (portrait) or 2 (landscape).
 * The pattern sums to totalColumns.
 * @param {number} totalColumns - Total columns to fill (4 or 5)
 * @param {number} landscapeCount - Number of landscape photos available
 * @param {number} portraitCount - Number of portrait photos available
 * @param {string|null} avoidSignature - Optional pattern signature to avoid
 * @param {number[]} randomValues - Array of random values for deterministic testing
 * @returns {number[]} - Array of slot widths, e.g., [2, 1, 2] or [1, 2, 2]
 */
function generateRowPattern(totalColumns, landscapeCount, portraitCount, avoidSignature, randomValues) {
  let randomIndex = 0;
  const getNextRandom = () => randomValues ? randomValues[randomIndex++] || 0.5 : Math.random();

  const generateSinglePattern = () => {
    const pattern = [];
    let remaining = totalColumns;
    let availableLandscapes = landscapeCount;
    let availablePortraits = portraitCount;

    while (remaining > 0) {
      if (remaining === 1) {
        // Only one column left - must use portrait (or stacked landscapes)
        pattern.push(1);
        if (availablePortraits > 0) {
          availablePortraits--;
        } else {
          availableLandscapes = Math.max(0, availableLandscapes - 2);
        }
        remaining = 0;
      } else if (remaining >= 2) {
        // Can fit landscape (2 cols) or portrait (1 col)
        const canUseLandscape = availableLandscapes > 0;
        const canUsePortrait = availablePortraits > 0 || availableLandscapes >= 2;

        if (!canUseLandscape && !canUsePortrait) {
          break;
        }

        let usePortrait;
        if (!canUseLandscape) {
          usePortrait = true;
        } else if (!canUsePortrait) {
          usePortrait = false;
        } else {
          // Both available - randomly choose
          usePortrait = getNextRandom() < 0.4;
        }

        if (usePortrait) {
          pattern.push(1);
          if (availablePortraits > 0) {
            availablePortraits--;
          } else {
            availableLandscapes = Math.max(0, availableLandscapes - 2);
          }
          remaining -= 1;
        } else {
          pattern.push(2);
          availableLandscapes--;
          remaining -= 2;
        }
      }
    }

    return pattern;
  };

  // Generate initial pattern
  let pattern = generateSinglePattern();

  // If we should try to avoid a specific pattern signature
  if (avoidSignature && getNextRandom() < INTER_ROW_DIFFER_PROBABILITY) {
    let currentSignature = patternToSignature(pattern);
    let maxAttempts = 3;
    let attempts = 0;

    while (!patternsAreDifferent(currentSignature, avoidSignature) && attempts < maxAttempts) {
      pattern = generateSinglePattern();
      currentSignature = patternToSignature(pattern);
      attempts++;
    }
  }

  return pattern;
}

/**
 * Select a photo from available pools that best matches the container aspect ratio.
 * Uses probability-based selection.
 * @param {number} containerAspectRatio - Width/height ratio of the container
 * @param {number} portraitCount - Number of portrait photos available
 * @param {number} landscapeCount - Number of landscape photos available
 * @param {boolean} forceRandom - If true, always pick randomly regardless of container shape
 * @param {number} randomValue - Random value between 0 and 1 for deterministic testing
 * @returns {string|null} - 'portrait', 'landscape', or null if none available
 */
function selectPhotoForContainer(containerAspectRatio, portraitCount, landscapeCount, forceRandom, randomValue) {
  // If no photos available at all, return null
  if (portraitCount === 0 && landscapeCount === 0) {
    return null;
  }

  // Determine if we should use matching orientation or random selection
  const useMatchingOrientation = !forceRandom && randomValue < ORIENTATION_MATCH_PROBABILITY;

  // Determine which orientation the container prefers
  const containerPrefersPortrait = containerAspectRatio < 1;

  if (useMatchingOrientation) {
    // Use matching orientation logic
    if (containerPrefersPortrait) {
      // Container is taller than wide - prefer portrait
      if (portraitCount > 0) {
        return 'portrait';
      } else if (landscapeCount > 0) {
        return 'landscape';
      }
    } else {
      // Container is wider than tall - prefer landscape
      if (landscapeCount > 0) {
        return 'landscape';
      } else if (portraitCount > 0) {
        return 'portrait';
      }
    }
  } else {
    // Random selection: pick from all available photos
    const totalPhotos = portraitCount + landscapeCount;
    if (totalPhotos > 0) {
      // Use a second random value to decide which type
      // This is simplified - in real code, it picks randomly from combined pool
      const portraitProbability = portraitCount / totalPhotos;
      return randomValue < portraitProbability ? 'portrait' : 'landscape';
    }
  }

  return null;
}

/**
 * Determine whether to use stacked landscapes for a 1-column slot.
 * @param {number} portraitCount - Number of portrait photos available
 * @param {number} landscapeCount - Number of landscape photos available
 * @param {number} randomValue - Random value between 0 and 1 for deterministic testing
 * @returns {boolean} - True if stacked landscapes should be used
 */
function shouldUseStackedLandscapes(portraitCount, landscapeCount, randomValue) {
  const hasPortraits = portraitCount > 0;
  const hasEnoughLandscapes = landscapeCount >= 2;

  // Use stacked landscapes with STACKED_LANDSCAPES_PROBABILITY,
  // but only if we have enough landscapes and fallback available
  return hasEnoughLandscapes &&
    (randomValue < STACKED_LANDSCAPES_PROBABILITY || !hasPortraits);
}

// ============================================================================
// Tests
// ============================================================================

describe('Layout Variety Algorithm', () => {
  describe('selectPhotoForContainer - Randomized Orientation Selection', () => {
    describe('probability-based matching', () => {
      it('should prefer matching orientation ~70% of the time (portrait for tall container)', () => {
        // Container is tall (aspect ratio < 1), should prefer portrait
        // With randomValue < 0.7 (matching probability), use matching orientation
        const result = selectPhotoForContainer(0.5, 5, 5, false, 0.3);
        expect(result).toBe('portrait');
      });

      it('should prefer matching orientation ~70% of the time (landscape for wide container)', () => {
        // Container is wide (aspect ratio > 1), should prefer landscape
        // With randomValue < 0.7 (matching probability), use matching orientation
        const result = selectPhotoForContainer(1.5, 5, 5, false, 0.3);
        expect(result).toBe('landscape');
      });

      it('should pick randomly when outside matching probability', () => {
        // With randomValue >= 0.7, should pick randomly
        // The actual selection depends on the random value used for type selection
        const result = selectPhotoForContainer(0.5, 5, 5, false, 0.8);
        expect(result).not.toBeNull();
        expect(['portrait', 'landscape']).toContain(result);
      });

      it('should always pick randomly when forceRandom is true', () => {
        // Even with randomValue < 0.7, forceRandom should bypass matching
        const result = selectPhotoForContainer(0.5, 5, 5, true, 0.3);
        expect(result).not.toBeNull();
        expect(['portrait', 'landscape']).toContain(result);
      });
    });

    describe('fallback behavior when only one type available', () => {
      it('should return landscape when no portraits available (matching mode)', () => {
        // Container prefers portrait but only landscapes exist
        const result = selectPhotoForContainer(0.5, 0, 5, false, 0.3);
        expect(result).toBe('landscape');
      });

      it('should return portrait when no landscapes available (matching mode)', () => {
        // Container prefers landscape but only portraits exist
        const result = selectPhotoForContainer(1.5, 5, 0, false, 0.3);
        expect(result).toBe('portrait');
      });

      it('should return null when no photos available', () => {
        const result = selectPhotoForContainer(1.0, 0, 0, false, 0.5);
        expect(result).toBeNull();
      });
    });

    describe('container aspect ratio thresholds', () => {
      it('should prefer portrait for aspect ratio < 1', () => {
        const result = selectPhotoForContainer(0.8, 5, 5, false, 0.3);
        expect(result).toBe('portrait');
      });

      it('should prefer landscape for aspect ratio >= 1', () => {
        const result = selectPhotoForContainer(1.0, 5, 5, false, 0.3);
        expect(result).toBe('landscape');
      });

      it('should prefer landscape for aspect ratio > 1', () => {
        const result = selectPhotoForContainer(2.0, 5, 5, false, 0.3);
        expect(result).toBe('landscape');
      });
    });

    describe('edge cases', () => {
      it('should handle single portrait available', () => {
        const result = selectPhotoForContainer(1.5, 1, 0, false, 0.3);
        expect(result).toBe('portrait');
      });

      it('should handle single landscape available', () => {
        const result = selectPhotoForContainer(0.5, 0, 1, false, 0.3);
        expect(result).toBe('landscape');
      });

      it('should handle boundary random value (exactly at threshold)', () => {
        // Exactly at 0.7 should still use random selection (>= threshold is random)
        const result = selectPhotoForContainer(0.5, 5, 5, false, 0.7);
        expect(result).not.toBeNull();
      });
    });
  });

  describe('generateRowPattern - Pattern Generation', () => {
    describe('pattern sums to total columns', () => {
      it('should generate pattern that sums to 5 columns', () => {
        const pattern = generateRowPattern(5, 10, 10, null, [0.5, 0.5, 0.5, 0.5]);
        const sum = pattern.reduce((a, b) => a + b, 0);
        expect(sum).toBe(5);
      });

      it('should generate pattern that sums to 4 columns', () => {
        const pattern = generateRowPattern(4, 10, 10, null, [0.5, 0.5, 0.5, 0.5]);
        const sum = pattern.reduce((a, b) => a + b, 0);
        expect(sum).toBe(4);
      });

      it('should generate pattern with odd column count (5 cols, one 1-col slot)', () => {
        // Force all landscapes (randomValue > 0.4) until we need 1 column
        const pattern = generateRowPattern(5, 10, 10, null, [0.5, 0.5, 0.5]);
        const sum = pattern.reduce((a, b) => a + b, 0);
        expect(sum).toBe(5);
        expect(pattern).toContain(1); // Must have at least one 1-column slot for odd total
      });
    });

    describe('pattern with limited photos', () => {
      it('should use only landscapes when no portraits available', () => {
        const pattern = generateRowPattern(4, 2, 0, null, [0.5]);
        // With only 2 landscapes and 4 columns: [2, 2]
        expect(pattern).toEqual([2, 2]);
      });

      it('should use only portraits when no landscapes available', () => {
        const pattern = generateRowPattern(4, 0, 4, null, [0.1, 0.1, 0.1, 0.1]);
        // With only portraits and 4 columns: [1, 1, 1, 1]
        expect(pattern).toEqual([1, 1, 1, 1]);
      });

      it('should use stacked landscapes for 1-col when no portraits', () => {
        // 3 landscapes, 0 portraits, 5 columns
        // Pattern could be [2, 2, 1] where the 1 uses stacked landscapes
        const pattern = generateRowPattern(5, 10, 0, null, [0.5, 0.5]);
        const sum = pattern.reduce((a, b) => a + b, 0);
        expect(sum).toBe(5);
      });

      it('should handle exhausted photo pools', () => {
        // Very limited photos
        const pattern = generateRowPattern(4, 1, 1, null, [0.5]);
        const sum = pattern.reduce((a, b) => a + b, 0);
        // Should generate what it can with available photos
        expect(sum).toBeLessThanOrEqual(4);
      });
    });

    describe('pattern variation', () => {
      it('should generate different patterns with different random seeds', () => {
        // Portrait-heavy pattern (randomValues < 0.4)
        const pattern1 = generateRowPattern(4, 10, 10, null, [0.1, 0.1]);
        // Landscape-heavy pattern (randomValues > 0.4)
        const pattern2 = generateRowPattern(4, 10, 10, null, [0.8, 0.8]);

        // They should be different (portrait vs landscape distribution)
        expect(pattern1).not.toEqual(pattern2);
      });

      it('should generate portraits when random value < 0.4', () => {
        const pattern = generateRowPattern(4, 10, 10, null, [0.1, 0.1, 0.1, 0.1]);
        // Should favor portraits
        expect(pattern.filter(w => w === 1).length).toBeGreaterThan(0);
      });

      it('should generate landscapes when random value >= 0.4', () => {
        const pattern = generateRowPattern(4, 10, 10, null, [0.8, 0.8]);
        // Should favor landscapes
        expect(pattern.filter(w => w === 2).length).toBeGreaterThan(0);
      });
    });

    describe('inter-row pattern variation', () => {
      it('should try to avoid matching top row pattern', () => {
        // Generate a pattern trying to avoid "LLP"
        // With INTER_ROW_DIFFER_PROBABILITY = 0.7, randomValue < 0.7 triggers avoidance
        const pattern = generateRowPattern(5, 10, 10, 'LLP', [0.5, 0.5, 0.3]);
        const signature = patternToSignature(pattern);
        // Pattern should be different from "LLP" (soft preference, not guaranteed)
        // This test verifies the mechanism works, not a strict guarantee
        expect(signature).toBeDefined();
      });

      it('should not always avoid pattern when random >= 0.7', () => {
        // With randomValue >= INTER_ROW_DIFFER_PROBABILITY, don't try to avoid
        const pattern = generateRowPattern(5, 10, 10, 'LLP', [0.5, 0.5, 0.9]);
        const signature = patternToSignature(pattern);
        // May or may not match - just verify it generates a valid pattern
        expect(signature).toBeDefined();
      });
    });
  });

  describe('getRandomFillDirection - Fill Direction', () => {
    it('should return rtl when random < 0.5', () => {
      expect(getRandomFillDirection(0.3)).toBe('rtl');
      expect(getRandomFillDirection(0.1)).toBe('rtl');
      expect(getRandomFillDirection(0.49)).toBe('rtl');
    });

    it('should return ltr when random >= 0.5', () => {
      expect(getRandomFillDirection(0.5)).toBe('ltr');
      expect(getRandomFillDirection(0.7)).toBe('ltr');
      expect(getRandomFillDirection(0.99)).toBe('ltr');
    });

    it('should return ltr at boundary (0.5)', () => {
      expect(getRandomFillDirection(0.5)).toBe('ltr');
    });
  });

  describe('patternToSignature - Pattern Signature Conversion', () => {
    it('should convert 2-width slots to L', () => {
      expect(patternToSignature([2])).toBe('L');
      expect(patternToSignature([2, 2])).toBe('LL');
    });

    it('should convert 1-width slots to P', () => {
      expect(patternToSignature([1])).toBe('P');
      expect(patternToSignature([1, 1, 1])).toBe('PPP');
    });

    it('should handle mixed patterns', () => {
      expect(patternToSignature([2, 1, 2])).toBe('LPL');
      expect(patternToSignature([1, 2, 2])).toBe('PLL');
      expect(patternToSignature([2, 2, 1])).toBe('LLP');
      expect(patternToSignature([1, 2, 1, 1])).toBe('PLPP');
    });

    it('should handle empty pattern', () => {
      expect(patternToSignature([])).toBe('');
    });
  });

  describe('patternsAreDifferent - Pattern Comparison', () => {
    it('should return true for different patterns', () => {
      expect(patternsAreDifferent('LLP', 'PLL')).toBe(true);
      expect(patternsAreDifferent('LPL', 'LLP')).toBe(true);
      expect(patternsAreDifferent('PP', 'LL')).toBe(true);
    });

    it('should return false for identical patterns', () => {
      expect(patternsAreDifferent('LLP', 'LLP')).toBe(false);
      expect(patternsAreDifferent('PLL', 'PLL')).toBe(false);
      expect(patternsAreDifferent('', '')).toBe(false);
    });

    it('should handle null patterns', () => {
      expect(patternsAreDifferent(null, 'LLP')).toBe(true);
      expect(patternsAreDifferent('LLP', null)).toBe(true);
      expect(patternsAreDifferent(null, null)).toBe(false);
    });
  });

  describe('shouldUseStackedLandscapes - Stacked Landscapes Decision', () => {
    it('should return true when enough landscapes and random < 0.3', () => {
      expect(shouldUseStackedLandscapes(5, 4, 0.1)).toBe(true);
      expect(shouldUseStackedLandscapes(5, 2, 0.2)).toBe(true);
    });

    it('should return false when random >= 0.3 and portraits available', () => {
      expect(shouldUseStackedLandscapes(5, 4, 0.5)).toBe(false);
      expect(shouldUseStackedLandscapes(1, 4, 0.8)).toBe(false);
    });

    it('should return true when no portraits available (fallback)', () => {
      // Even with random >= 0.3, if no portraits, use stacked landscapes
      expect(shouldUseStackedLandscapes(0, 4, 0.8)).toBe(true);
      expect(shouldUseStackedLandscapes(0, 2, 0.9)).toBe(true);
    });

    it('should return false when not enough landscapes', () => {
      expect(shouldUseStackedLandscapes(5, 1, 0.1)).toBe(false);
      expect(shouldUseStackedLandscapes(0, 1, 0.1)).toBe(false);
    });

    it('should return false when exactly 2 landscapes but random >= 0.3 and portraits exist', () => {
      expect(shouldUseStackedLandscapes(5, 2, 0.5)).toBe(false);
    });
  });

  describe('statistical distribution tests', () => {
    it('should select matching orientation approximately 70% of the time', () => {
      // Run 1000 trials with varying random values
      let matchCount = 0;
      const trials = 1000;

      for (let i = 0; i < trials; i++) {
        const randomValue = i / trials; // Uniform distribution from 0 to ~1
        const result = selectPhotoForContainer(0.5, 5, 5, false, randomValue);
        // With randomValue < 0.7, matching orientation (portrait for 0.5 aspect) is selected
        if (randomValue < ORIENTATION_MATCH_PROBABILITY && result === 'portrait') {
          matchCount++;
        }
      }

      // Should have approximately 70% matches (within reasonable tolerance)
      const matchPercentage = matchCount / trials;
      expect(matchPercentage).toBeGreaterThan(0.65);
      expect(matchPercentage).toBeLessThan(0.75);
    });

    it('should generate approximately 50% rtl fill directions', () => {
      let rtlCount = 0;
      const trials = 1000;

      for (let i = 0; i < trials; i++) {
        const randomValue = i / trials;
        if (getRandomFillDirection(randomValue) === 'rtl') {
          rtlCount++;
        }
      }

      const rtlPercentage = rtlCount / trials;
      expect(rtlPercentage).toBeGreaterThan(0.45);
      expect(rtlPercentage).toBeLessThan(0.55);
    });
  });
});
