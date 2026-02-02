import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../fixtures/albums');

// Valid EXIF orientation values
const VALID_ORIENTATIONS = [1, 2, 3, 4, 5, 6, 7, 8];

// Fixture years to test
const FIXTURE_YEARS = ['2010', '2015', '2020', '2025'];

describe('Album Fixtures', () => {
  describe('Fixture File Structure', () => {
    for (const year of FIXTURE_YEARS) {
      describe(`album-${year}.json`, () => {
        let fixture;

        // Read fixture once per year instead of in each test
        beforeAll(async () => {
          const content = await readFile(join(FIXTURES_DIR, `album-${year}.json`), 'utf8');
          fixture = JSON.parse(content);
        });

        it('is valid JSON', () => {
          expect(fixture).toBeDefined();
        });

        it('has required count property', () => {
          expect(fixture.count).toBe(25);
        });

        it('has images array with 25 photos', () => {
          expect(fixture.images).toBeInstanceOf(Array);
          expect(fixture.images.length).toBe(25);
        });

        it('each image has required properties', () => {
          for (const image of fixture.images) {
            expect(image).toHaveProperty('file');
            expect(image).toHaveProperty('Orientation');
            expect(typeof image.file).toBe('string');
            expect(image.file.startsWith('photos/')).toBe(true);
            expect(VALID_ORIENTATIONS).toContain(image.Orientation);
          }
        });

        it('file paths match expected era', () => {
          // Check that at least some photos are from the expected era
          const yearNum = parseInt(year);
          const eraStart = yearNum - 2;
          const eraEnd = yearNum + 2;

          const photosInEra = fixture.images.filter(img => {
            const yearMatch = img.file.match(/photos\/(\d{4})\//);
            if (yearMatch) {
              const photoYear = parseInt(yearMatch[1]);
              return photoYear >= eraStart && photoYear <= eraEnd;
            }
            return false;
          });

          // At least 50% should be within the era range
          expect(photosInEra.length).toBeGreaterThanOrEqual(12);
        });

        it('has metadata for documentation', () => {
          expect(fixture._metadata).toBeDefined();
          expect(fixture._metadata.description).toBeDefined();
          expect(fixture._metadata.expectedSizes).toBeDefined();
        });

        it('includes variety of orientations', () => {
          const orientations = new Set(fixture.images.map(img => img.Orientation));
          // Should have at least 3 different orientations
          expect(orientations.size).toBeGreaterThanOrEqual(3);
        });
      });
    }
  });

  describe('Cross-Fixture Consistency', () => {
    // Cache all fixtures for cross-fixture tests
    const fixtures = {};

    beforeAll(async () => {
      for (const year of FIXTURE_YEARS) {
        const content = await readFile(join(FIXTURES_DIR, `album-${year}.json`), 'utf8');
        fixtures[year] = JSON.parse(content);
      }
    });

    it('all fixtures have same count property', () => {
      const counts = FIXTURE_YEARS.map(year => fixtures[year].count);
      // All should be 25
      expect(new Set(counts).size).toBe(1);
      expect(counts[0]).toBe(25);
    });

    it('fixtures have unique file paths (no duplicates)', () => {
      const allPaths = new Set();
      let totalPhotos = 0;

      for (const year of FIXTURE_YEARS) {
        for (const image of fixtures[year].images) {
          allPaths.add(image.file);
          totalPhotos++;
        }
      }

      // Should be 100 unique paths (25 per fixture × 4 fixtures)
      expect(allPaths.size).toBe(totalPhotos);
    });
  });
});
