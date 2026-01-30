import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Pure function versions of individual photo swap algorithms from www/js/main.js
 * These extract the core logic for testability without jQuery dependency.
 * SYNC: Keep in sync with www/js/main.js selectPhotoToReplace and makeSpaceForPhoto functions
 */

// Configuration constants (same as in main.js)
const MIN_DISPLAY_TIME = 60 * 1000; // 1 minute

/**
 * Pure function version of selectPhotoToReplace weighted random selection algorithm.
 * Photos that have been displayed longer have higher probability of being selected.
 *
 * @param {Object[]} photos - Array of photo objects with { displayTime, columns, id }
 * @param {number} now - Current timestamp
 * @param {number} randomValue - Random value between 0 and 1 (for deterministic testing)
 * @returns {Object|null} - The selected photo, or null if no photos are eligible
 */
function selectPhotoToReplace(photos, now, randomValue) {
  if (!photos || photos.length === 0) {
    return null;
  }

  // Filter to only photos that have been displayed >= MIN_DISPLAY_TIME
  const eligiblePhotos = photos
    .filter(photo => photo.displayTime && (now - photo.displayTime) >= MIN_DISPLAY_TIME)
    .map(photo => ({
      ...photo,
      weight: now - photo.displayTime  // Weight = time on screen (older = higher weight)
    }));

  // Return null if no photos are eligible yet
  if (eligiblePhotos.length === 0) {
    return null;
  }

  // Calculate total weight for weighted random selection
  const totalWeight = eligiblePhotos.reduce((sum, photo) => sum + photo.weight, 0);

  // Weighted random selection
  const targetValue = randomValue * totalWeight;
  let cumulativeWeight = 0;

  for (const photo of eligiblePhotos) {
    cumulativeWeight += photo.weight;
    if (targetValue <= cumulativeWeight) {
      return photo;
    }
  }

  // Fallback: return the last eligible photo (shouldn't normally reach here)
  return eligiblePhotos[eligiblePhotos.length - 1];
}

/**
 * Pure function version of makeSpaceForPhoto algorithm.
 * Removes adjacent photos until enough columns are freed.
 *
 * @param {Object[]} photos - Array of photo objects in order with { columns, id }
 * @param {number} targetIndex - Index of the initially selected photo to replace
 * @param {number} neededColumns - Number of columns needed for the new photo
 * @param {string} initialDirection - 'left' or 'right' for deterministic testing
 * @returns {Object|null} - { photosToRemove: Object[], insertionIndex: number, totalColumns: number } or null if unable
 */
function makeSpaceForPhoto(photos, targetIndex, neededColumns, initialDirection) {
  if (!photos || photos.length === 0 || targetIndex < 0 || targetIndex >= photos.length) {
    return null;
  }

  // Start with the target photo
  const targetPhoto = photos[targetIndex];
  const photosToRemove = [targetPhoto];
  let totalColumns = targetPhoto.columns || 1;
  let leftIndex = targetIndex;
  let rightIndex = targetIndex;

  // Use provided initial direction
  let currentDirection = initialDirection || 'left';

  // Keep removing adjacent photos until we have enough space
  while (totalColumns < neededColumns) {
    let adjacent = null;

    // Try current direction first
    if (currentDirection === 'left' && leftIndex > 0) {
      leftIndex--;
      adjacent = photos[leftIndex];
    } else if (currentDirection === 'right' && rightIndex < photos.length - 1) {
      rightIndex++;
      adjacent = photos[rightIndex];
    }

    // If current direction exhausted, try opposite
    if (!adjacent) {
      currentDirection = (currentDirection === 'left') ? 'right' : 'left';

      if (currentDirection === 'left' && leftIndex > 0) {
        leftIndex--;
        adjacent = photos[leftIndex];
      } else if (currentDirection === 'right' && rightIndex < photos.length - 1) {
        rightIndex++;
        adjacent = photos[rightIndex];
      }
    }

    // If no more adjacent photos in either direction, we can't make enough space
    if (!adjacent) {
      break;
    }

    photosToRemove.push(adjacent);
    totalColumns += adjacent.columns || 1;

    // Alternate direction for next iteration
    currentDirection = (currentDirection === 'left') ? 'right' : 'left';
  }

  // If we still don't have enough space, return null
  if (totalColumns < neededColumns) {
    return null;
  }

  return {
    photosToRemove,
    insertionIndex: leftIndex,
    totalColumns
  };
}

/**
 * Pure function version of getPhotoColumns.
 * Extracts columns from a photo object.
 *
 * @param {Object} photo - Photo object with columns property
 * @returns {number} - Number of columns
 */
function getPhotoColumns(photo) {
  if (photo && photo.columns && photo.columns > 0) {
    return photo.columns;
  }
  return 1;
}

describe('Individual Photo Swap Algorithm', () => {
  describe('selectPhotoToReplace - Weighted Random Selection', () => {
    const now = Date.now();

    describe('filtering by MIN_DISPLAY_TIME', () => {
      it('should return null when no photos are provided', () => {
        expect(selectPhotoToReplace([], now, 0.5)).toBeNull();
        expect(selectPhotoToReplace(null, now, 0.5)).toBeNull();
      });

      it('should return null when no photos meet MIN_DISPLAY_TIME', () => {
        const photos = [
          { id: 1, displayTime: now - 30000, columns: 1 },  // 30 seconds old
          { id: 2, displayTime: now - 45000, columns: 2 },  // 45 seconds old
          { id: 3, displayTime: now - 50000, columns: 1 },  // 50 seconds old
        ];
        expect(selectPhotoToReplace(photos, now, 0.5)).toBeNull();
      });

      it('should filter out photos below MIN_DISPLAY_TIME threshold', () => {
        const photos = [
          { id: 1, displayTime: now - 30000, columns: 1 },      // 30 seconds - NOT eligible
          { id: 2, displayTime: now - 60000, columns: 2 },      // 60 seconds - ELIGIBLE
          { id: 3, displayTime: now - 50000, columns: 1 },      // 50 seconds - NOT eligible
        ];
        const result = selectPhotoToReplace(photos, now, 0.5);
        expect(result).not.toBeNull();
        expect(result.id).toBe(2);  // Only eligible photo
      });

      it('should include photos exactly at MIN_DISPLAY_TIME threshold', () => {
        const photos = [
          { id: 1, displayTime: now - MIN_DISPLAY_TIME, columns: 1 },  // Exactly 60 seconds
        ];
        const result = selectPhotoToReplace(photos, now, 0.5);
        expect(result).not.toBeNull();
        expect(result.id).toBe(1);
      });

      it('should include photos older than MIN_DISPLAY_TIME', () => {
        const photos = [
          { id: 1, displayTime: now - 120000, columns: 1 },  // 2 minutes old
          { id: 2, displayTime: now - 180000, columns: 2 },  // 3 minutes old
        ];
        const result = selectPhotoToReplace(photos, now, 0.5);
        expect(result).not.toBeNull();
      });

      it('should skip photos without displayTime', () => {
        const photos = [
          { id: 1, columns: 1 },  // No displayTime
          { id: 2, displayTime: now - 120000, columns: 2 },
        ];
        const result = selectPhotoToReplace(photos, now, 0.5);
        expect(result.id).toBe(2);  // Only photo with displayTime
      });
    });

    describe('weighted selection algorithm', () => {
      it('should weight older photos higher (more likely to be selected)', () => {
        // Create photos with different ages
        const photos = [
          { id: 1, displayTime: now - 120000, columns: 1 },  // 2 min old, weight = 120000
          { id: 2, displayTime: now - 240000, columns: 2 },  // 4 min old, weight = 240000
        ];
        // Total weight = 360000
        // Photo 1: 120000/360000 = 0.333 of probability
        // Photo 2: 240000/360000 = 0.667 of probability

        // With randomValue < 0.333, photo 1 should be selected
        const result1 = selectPhotoToReplace(photos, now, 0.2);
        expect(result1.id).toBe(1);

        // With randomValue > 0.333, photo 2 should be selected
        const result2 = selectPhotoToReplace(photos, now, 0.5);
        expect(result2.id).toBe(2);
      });

      it('should correctly distribute probability based on weights', () => {
        // 3 photos with weights 100k, 200k, 300k (total 600k)
        // Probabilities: 1/6, 2/6, 3/6
        const photos = [
          { id: 1, displayTime: now - 100000 - MIN_DISPLAY_TIME, columns: 1 },  // weight = 160k
          { id: 2, displayTime: now - 200000 - MIN_DISPLAY_TIME, columns: 1 },  // weight = 260k
          { id: 3, displayTime: now - 300000 - MIN_DISPLAY_TIME, columns: 1 },  // weight = 360k
        ];
        // Total weight = 780k
        // Photo 1: 160k/780k ≈ 0.205
        // Photo 2: 260k/780k ≈ 0.333
        // Photo 3: 360k/780k ≈ 0.462

        // Cumulative: 0.205, 0.538, 1.0

        // randomValue 0.1 should select photo 1
        expect(selectPhotoToReplace(photos, now, 0.1).id).toBe(1);

        // randomValue 0.3 should select photo 2
        expect(selectPhotoToReplace(photos, now, 0.3).id).toBe(2);

        // randomValue 0.8 should select photo 3
        expect(selectPhotoToReplace(photos, now, 0.8).id).toBe(3);
      });

      it('should select only photo when just one is eligible', () => {
        const photos = [
          { id: 1, displayTime: now - 30000, columns: 1 },   // NOT eligible
          { id: 2, displayTime: now - 120000, columns: 2 },  // ELIGIBLE
          { id: 3, displayTime: now - 45000, columns: 1 },   // NOT eligible
        ];

        // Any random value should select photo 2
        expect(selectPhotoToReplace(photos, now, 0.0).id).toBe(2);
        expect(selectPhotoToReplace(photos, now, 0.5).id).toBe(2);
        expect(selectPhotoToReplace(photos, now, 0.99).id).toBe(2);
      });

      it('should handle equal weights fairly', () => {
        const photos = [
          { id: 1, displayTime: now - 120000, columns: 1 },  // weight = 120k
          { id: 2, displayTime: now - 120000, columns: 2 },  // weight = 120k
        ];
        // Total weight = 240k, each has 50%

        // randomValue < 0.5 should select photo 1
        expect(selectPhotoToReplace(photos, now, 0.3).id).toBe(1);

        // randomValue > 0.5 should select photo 2
        expect(selectPhotoToReplace(photos, now, 0.7).id).toBe(2);
      });

      it('should return last photo as fallback with randomValue of 1.0', () => {
        const photos = [
          { id: 1, displayTime: now - 120000, columns: 1 },
          { id: 2, displayTime: now - 180000, columns: 2 },
        ];
        const result = selectPhotoToReplace(photos, now, 1.0);
        expect(result.id).toBe(2);  // Last photo in the list
      });
    });

    describe('edge cases', () => {
      it('should handle very old photos (large weights)', () => {
        const photos = [
          { id: 1, displayTime: now - 3600000, columns: 1 },  // 1 hour old
          { id: 2, displayTime: now - 7200000, columns: 2 },  // 2 hours old
        ];
        const result = selectPhotoToReplace(photos, now, 0.5);
        expect(result).not.toBeNull();
      });

      it('should skip photos with zero displayTime (falsy)', () => {
        const photos = [
          { id: 1, displayTime: 0, columns: 1 },  // displayTime of 0 is falsy
        ];
        // 0 is falsy, so it fails the displayTime truthy check and is skipped
        const result = selectPhotoToReplace(photos, now, 0.5);
        expect(result).toBeNull();
      });
    });
  });

  describe('makeSpaceForPhoto - Space Management', () => {
    describe('basic space allocation', () => {
      it('should return null for empty photos array', () => {
        expect(makeSpaceForPhoto([], 0, 2, 'left')).toBeNull();
        expect(makeSpaceForPhoto(null, 0, 2, 'left')).toBeNull();
      });

      it('should return null for invalid target index', () => {
        const photos = [{ id: 1, columns: 1 }];
        expect(makeSpaceForPhoto(photos, -1, 1, 'left')).toBeNull();
        expect(makeSpaceForPhoto(photos, 5, 1, 'left')).toBeNull();
      });

      it('should return target photo when its columns are sufficient', () => {
        const photos = [
          { id: 1, columns: 2 },
          { id: 2, columns: 2 },
          { id: 3, columns: 1 },
        ];
        const result = makeSpaceForPhoto(photos, 1, 2, 'left');
        expect(result).not.toBeNull();
        expect(result.photosToRemove).toHaveLength(1);
        expect(result.photosToRemove[0].id).toBe(2);
        expect(result.totalColumns).toBe(2);
        expect(result.insertionIndex).toBe(1);
      });

      it('should return target photo when needing fewer columns than available', () => {
        const photos = [
          { id: 1, columns: 3 },
        ];
        const result = makeSpaceForPhoto(photos, 0, 2, 'left');
        expect(result.totalColumns).toBe(3);
        expect(result.photosToRemove).toHaveLength(1);
      });
    });

    describe('removing adjacent photos', () => {
      it('should expand left first when initialDirection is left', () => {
        const photos = [
          { id: 1, columns: 1 },
          { id: 2, columns: 1 },  // target
          { id: 3, columns: 1 },
        ];
        const result = makeSpaceForPhoto(photos, 1, 2, 'left');
        expect(result.photosToRemove).toHaveLength(2);
        expect(result.photosToRemove.map(p => p.id)).toContain(2); // target
        expect(result.photosToRemove.map(p => p.id)).toContain(1); // left neighbor
        expect(result.totalColumns).toBe(2);
        expect(result.insertionIndex).toBe(0);
      });

      it('should expand right first when initialDirection is right', () => {
        const photos = [
          { id: 1, columns: 1 },
          { id: 2, columns: 1 },  // target
          { id: 3, columns: 1 },
        ];
        const result = makeSpaceForPhoto(photos, 1, 2, 'right');
        expect(result.photosToRemove).toHaveLength(2);
        expect(result.photosToRemove.map(p => p.id)).toContain(2); // target
        expect(result.photosToRemove.map(p => p.id)).toContain(3); // right neighbor
        expect(result.totalColumns).toBe(2);
        expect(result.insertionIndex).toBe(1);
      });

      it('should alternate directions when expanding', () => {
        // 5 photos, each 1 column, target in middle, need 4 columns
        const photos = [
          { id: 1, columns: 1 },
          { id: 2, columns: 1 },
          { id: 3, columns: 1 },  // target
          { id: 4, columns: 1 },
          { id: 5, columns: 1 },
        ];
        const result = makeSpaceForPhoto(photos, 2, 4, 'left');
        expect(result.photosToRemove).toHaveLength(4);
        expect(result.totalColumns).toBe(4);
        // Should include target and 3 adjacent photos
        const removedIds = result.photosToRemove.map(p => p.id);
        expect(removedIds).toContain(3); // target
      });

      it('should switch to opposite direction when current is exhausted', () => {
        // Target at left edge, need to expand only right
        const photos = [
          { id: 1, columns: 1 },  // target at left edge
          { id: 2, columns: 1 },
          { id: 3, columns: 1 },
        ];
        const result = makeSpaceForPhoto(photos, 0, 2, 'left');
        expect(result.photosToRemove).toHaveLength(2);
        expect(result.photosToRemove.map(p => p.id)).toContain(1); // target
        expect(result.photosToRemove.map(p => p.id)).toContain(2); // right neighbor (switched)
        expect(result.totalColumns).toBe(2);
      });

      it('should handle target at right edge', () => {
        const photos = [
          { id: 1, columns: 1 },
          { id: 2, columns: 1 },
          { id: 3, columns: 1 },  // target at right edge
        ];
        const result = makeSpaceForPhoto(photos, 2, 2, 'right');
        expect(result.photosToRemove).toHaveLength(2);
        expect(result.photosToRemove.map(p => p.id)).toContain(3); // target
        expect(result.photosToRemove.map(p => p.id)).toContain(2); // left neighbor (switched)
      });
    });

    describe('insufficient space handling', () => {
      it('should return null when row has fewer columns than needed', () => {
        const photos = [
          { id: 1, columns: 1 },
          { id: 2, columns: 1 },
        ];
        const result = makeSpaceForPhoto(photos, 0, 5, 'left');
        expect(result).toBeNull();
      });

      it('should succeed when exactly enough columns exist', () => {
        const photos = [
          { id: 1, columns: 2 },
          { id: 2, columns: 2 },
        ];
        const result = makeSpaceForPhoto(photos, 0, 4, 'left');
        expect(result).not.toBeNull();
        expect(result.photosToRemove).toHaveLength(2);
        expect(result.totalColumns).toBe(4);
      });
    });

    describe('insertion index calculation', () => {
      it('should return leftmost index as insertion point', () => {
        const photos = [
          { id: 1, columns: 1 },
          { id: 2, columns: 1 },  // target
          { id: 3, columns: 1 },
        ];
        // Expanding left from index 1
        const result = makeSpaceForPhoto(photos, 1, 2, 'left');
        expect(result.insertionIndex).toBe(0);  // Leftmost removed photo's position
      });

      it('should maintain correct insertion index when expanding only right', () => {
        const photos = [
          { id: 1, columns: 1 },  // target at left edge
          { id: 2, columns: 1 },
        ];
        const result = makeSpaceForPhoto(photos, 0, 2, 'left');
        expect(result.insertionIndex).toBe(0);  // Target position unchanged
      });

      it('should track insertion index through multiple expansions', () => {
        const photos = [
          { id: 1, columns: 1 },
          { id: 2, columns: 1 },
          { id: 3, columns: 1 },  // target
          { id: 4, columns: 1 },
          { id: 5, columns: 1 },
        ];
        const result = makeSpaceForPhoto(photos, 2, 3, 'left');
        // Expands left to index 1, so insertionIndex should be 1
        expect(result.insertionIndex).toBeLessThanOrEqual(2);
      });
    });

    describe('mixed column sizes', () => {
      it('should handle photos with different column widths', () => {
        const photos = [
          { id: 1, columns: 1 },  // portrait
          { id: 2, columns: 2 },  // landscape, target
          { id: 3, columns: 1 },  // portrait
        ];
        const result = makeSpaceForPhoto(photos, 1, 3, 'left');
        expect(result.photosToRemove).toHaveLength(2);
        expect(result.totalColumns).toBe(3);  // 2 + 1
      });

      it('should remove fewer photos when they have larger column counts', () => {
        const photos = [
          { id: 1, columns: 2 },
          { id: 2, columns: 2 },  // target
          { id: 3, columns: 2 },
        ];
        const result = makeSpaceForPhoto(photos, 1, 3, 'left');
        expect(result.photosToRemove).toHaveLength(2);
        expect(result.totalColumns).toBe(4);  // 2 + 2 = 4 >= 3
      });

      it('should handle panorama replacement (4 columns needed)', () => {
        const photos = [
          { id: 1, columns: 1 },
          { id: 2, columns: 2 },
          { id: 3, columns: 2 },  // target
        ];
        const result = makeSpaceForPhoto(photos, 2, 4, 'left');
        expect(result).not.toBeNull();
        expect(result.totalColumns).toBeGreaterThanOrEqual(4);
      });
    });

    describe('default column handling', () => {
      it('should treat missing columns as 1', () => {
        const photos = [
          { id: 1 },  // no columns property
          { id: 2, columns: 1 },  // target
        ];
        const result = makeSpaceForPhoto(photos, 1, 2, 'left');
        expect(result.totalColumns).toBe(2);  // 1 + 1
      });
    });
  });

  describe('getPhotoColumns helper', () => {
    it('should return columns from photo object', () => {
      expect(getPhotoColumns({ columns: 2 })).toBe(2);
      expect(getPhotoColumns({ columns: 1 })).toBe(1);
      expect(getPhotoColumns({ columns: 4 })).toBe(4);
    });

    it('should return 1 for missing columns', () => {
      expect(getPhotoColumns({})).toBe(1);
      expect(getPhotoColumns({ id: 1 })).toBe(1);
    });

    it('should return 1 for invalid columns', () => {
      expect(getPhotoColumns({ columns: 0 })).toBe(1);
      expect(getPhotoColumns({ columns: -1 })).toBe(1);
      expect(getPhotoColumns(null)).toBe(1);
      expect(getPhotoColumns(undefined)).toBe(1);
    });
  });
});
