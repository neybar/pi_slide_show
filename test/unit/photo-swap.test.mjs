import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Pure function versions of individual photo swap algorithms from www/js/main.js
 * These extract the core logic for testability without jQuery dependency.
 * SYNC: Keep in sync with www/js/main.js selectPhotoToReplace and makeSpaceForPhoto functions
 */

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

  // Build list of photos with weights based on time on screen
  // Older photos have higher weight, making them more likely to be replaced
  const eligiblePhotos = photos
    .filter(photo => photo.displayTime)
    .map(photo => ({
      ...photo,
      weight: Math.max(1000, now - photo.displayTime)  // Weight = time on screen (min 1s to avoid zero-weight edge cases)
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

    describe('photo eligibility', () => {
      it('should return null when no photos are provided', () => {
        expect(selectPhotoToReplace([], now, 0.5)).toBeNull();
        expect(selectPhotoToReplace(null, now, 0.5)).toBeNull();
      });

      it('should include all photos with displayTime regardless of age', () => {
        const photos = [
          { id: 1, displayTime: now - 5000, columns: 1 },   // 5 seconds old
          { id: 2, displayTime: now - 10000, columns: 2 },  // 10 seconds old
          { id: 3, displayTime: now - 15000, columns: 1 },  // 15 seconds old
        ];
        // All photos should be eligible - weighted selection determines which is chosen
        const result = selectPhotoToReplace(photos, now, 0.5);
        expect(result).not.toBeNull();
      });

      it('should include very new photos (weighted selection handles preference)', () => {
        const photos = [
          { id: 1, displayTime: now - 1000, columns: 1 },  // 1 second old
        ];
        const result = selectPhotoToReplace(photos, now, 0.5);
        expect(result).not.toBeNull();
        expect(result.id).toBe(1);
      });

      it('should include photos of any age', () => {
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
          { id: 2, displayTime: now - 5000, columns: 2 },
        ];
        const result = selectPhotoToReplace(photos, now, 0.5);
        expect(result.id).toBe(2);  // Only photo with displayTime
      });

      it('should return null when all photos lack displayTime', () => {
        const photos = [
          { id: 1, columns: 1 },  // No displayTime
          { id: 2, columns: 2 },  // No displayTime
        ];
        const result = selectPhotoToReplace(photos, now, 0.5);
        expect(result).toBeNull();
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
          { id: 1, displayTime: now - 100000, columns: 1 },  // weight = 100k
          { id: 2, displayTime: now - 200000, columns: 1 },  // weight = 200k
          { id: 3, displayTime: now - 300000, columns: 1 },  // weight = 300k
        ];
        // Total weight = 600k
        // Photo 1: 100k/600k ≈ 0.167
        // Photo 2: 200k/600k ≈ 0.333
        // Photo 3: 300k/600k ≈ 0.500

        // Cumulative: 0.167, 0.500, 1.0

        // randomValue 0.1 should select photo 1
        expect(selectPhotoToReplace(photos, now, 0.1).id).toBe(1);

        // randomValue 0.3 should select photo 2
        expect(selectPhotoToReplace(photos, now, 0.3).id).toBe(2);

        // randomValue 0.8 should select photo 3
        expect(selectPhotoToReplace(photos, now, 0.8).id).toBe(3);
      });

      it('should select only photo when just one has displayTime', () => {
        const photos = [
          { id: 1, columns: 1 },                              // No displayTime
          { id: 2, displayTime: now - 120000, columns: 2 },   // Only eligible photo
          { id: 3, columns: 1 },                              // No displayTime
        ];

        // Any random value should select photo 2 (only one with displayTime)
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

      it('should apply minimum weight floor for very new photos', () => {
        // Two photos: one just added (100ms), one slightly older (500ms)
        // Without min weight, they'd have weights 100 and 500
        // With min weight of 1000, both get weight 1000 (equal probability)
        const photos = [
          { id: 1, displayTime: now - 100, columns: 1 },   // 100ms old -> weight 1000 (min)
          { id: 2, displayTime: now - 500, columns: 1 },   // 500ms old -> weight 1000 (min)
        ];
        // Both should have equal weight of 1000, so 50/50 split
        // randomValue 0.3 should select photo 1
        expect(selectPhotoToReplace(photos, now, 0.3).id).toBe(1);
        // randomValue 0.7 should select photo 2
        expect(selectPhotoToReplace(photos, now, 0.7).id).toBe(2);
      });

      it('should use actual weight when above minimum floor', () => {
        // One photo below min (500ms -> 1000), one above (2000ms -> 2000)
        const photos = [
          { id: 1, displayTime: now - 500, columns: 1 },   // 500ms old -> weight 1000 (min)
          { id: 2, displayTime: now - 2000, columns: 1 },  // 2000ms old -> weight 2000
        ];
        // Total weight = 3000, photo 1 has 1/3, photo 2 has 2/3
        // randomValue 0.2 should select photo 1
        expect(selectPhotoToReplace(photos, now, 0.2).id).toBe(1);
        // randomValue 0.5 should select photo 2
        expect(selectPhotoToReplace(photos, now, 0.5).id).toBe(2);
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
