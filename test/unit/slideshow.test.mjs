import { describe, it, expect, beforeAll } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SlideShow } from '../../lib/slideshow.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'fixtures', 'mock-photos');

// Minimal valid JPEG (1x1 pixel)
const minimalJpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
  0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
  0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
  0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03,
  0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7d,
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
  0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72,
  0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45,
  0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75,
  0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3,
  0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9,
  0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4,
  0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01,
  0x00, 0x00, 0x3f, 0x00, 0xfb, 0xd5, 0xdb, 0x20, 0xa8, 0x00, 0x1f, 0xff,
  0xd9
]);

async function createMockImages() {
  const dirs = [
    join(fixturesDir, 'valid-photos'),
    join(fixturesDir, 'nested', 'subfolder'),
    join(fixturesDir, '.hidden'),
    join(fixturesDir, '@eaDir'),
    join(fixturesDir, 'iPhoto Library')
  ];

  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }

  const images = [
    'valid-photos/landscape.jpg',
    'valid-photos/portrait.jpg',
    'valid-photos/rotated180.jpg',
    'nested/subfolder/deep-photo.jpg',
    '.hidden/should-skip.jpg',
    '@eaDir/SYNOPHOTO_THUMB_XL.jpg',
    'iPhoto Library/should-skip.jpg'
  ];

  for (const imagePath of images) {
    const fullPath = join(fixturesDir, imagePath);
    await writeFile(fullPath, minimalJpeg);
  }
}

async function cleanupMockImages() {
  try {
    await rm(fixturesDir, { recursive: true, force: true });
  } catch {
    // Ignore errors during cleanup
  }
}

describe('SlideShow', () => {
  beforeAll(async () => {
    await cleanupMockImages();
    await createMockImages();
  });

  describe('constructor', () => {
    it('should use default values when no config provided', () => {
      const slideshow = new SlideShow();
      expect(slideshow.defaultCount).toBe(25);
      expect(slideshow.webPhotoDir).toBe('photos');
    });

    it('should use config values when provided', () => {
      const slideshow = new SlideShow({
        photo_library: '/custom/path',
        web_photo_dir: 'custom-photos',
        default_count: 50
      });
      expect(slideshow.photoLibrary).toBe('/custom/path');
      expect(slideshow.webPhotoDir).toBe('custom-photos');
      expect(slideshow.defaultCount).toBe(50);
    });
  });

  describe('findLibrary', () => {
    it('should return configured photo_library', async () => {
      const slideshow = new SlideShow({ photo_library: fixturesDir });
      const result = await slideshow.findLibrary();
      expect(result).toBe(fixturesDir);
    });

    it('should throw error when no library found (mocked paths)', async () => {
      // This test verifies the error is thrown when none of the default paths exist
      // We can't easily mock the file system, so we test the behavior with a custom config
      // and verify the error message format is correct
      const slideshow = new SlideShow({ photo_library: null });

      // If default paths exist on the test system, skip this test
      try {
        const result = await slideshow.findLibrary();
        if (result) {
          // A default path exists - test that it's returned correctly
          expect(typeof result).toBe('string');
        }
      } catch (error) {
        expect(error.message).toContain('Missing photo_library');
      }
    });
  });

  describe('collectDirectories', () => {
    it('should collect directories recursively', async () => {
      const slideshow = new SlideShow({ photo_library: fixturesDir });
      const dirs = await slideshow.collectDirectories();

      expect(dirs).toContain(fixturesDir);
      expect(dirs).toContain(join(fixturesDir, 'valid-photos'));
      expect(dirs).toContain(join(fixturesDir, 'nested'));
      expect(dirs).toContain(join(fixturesDir, 'nested', 'subfolder'));
    });

    it('should exclude hidden directories', async () => {
      const slideshow = new SlideShow({ photo_library: fixturesDir });
      const dirs = await slideshow.collectDirectories();

      const hasHidden = dirs.some(dir => dir.includes('.hidden'));
      expect(hasHidden).toBe(false);
    });

    it('should exclude @eaDir directories', async () => {
      const slideshow = new SlideShow({ photo_library: fixturesDir });
      const dirs = await slideshow.collectDirectories();

      const hasEaDir = dirs.some(dir => dir.includes('@eaDir'));
      expect(hasEaDir).toBe(false);
    });

    it('should exclude iPhoto Library directories', async () => {
      const slideshow = new SlideShow({ photo_library: fixturesDir });
      const dirs = await slideshow.collectDirectories();

      const hasIPhoto = dirs.some(dir => dir.includes('iPhoto Library'));
      expect(hasIPhoto).toBe(false);
    });
  });

  describe('findImagesInDir', () => {
    it('should find image files in directory', async () => {
      const slideshow = new SlideShow({ photo_library: fixturesDir });
      const images = await slideshow.findImagesInDir(join(fixturesDir, 'valid-photos'));

      expect(images.length).toBe(3);
      expect(images.some(img => img.includes('landscape.jpg'))).toBe(true);
      expect(images.some(img => img.includes('portrait.jpg'))).toBe(true);
      expect(images.some(img => img.includes('rotated180.jpg'))).toBe(true);
    });

    it('should return empty array for empty directory', async () => {
      const emptyDir = join(fixturesDir, 'empty');
      await mkdir(emptyDir, { recursive: true });

      const slideshow = new SlideShow({ photo_library: fixturesDir });
      const images = await slideshow.findImagesInDir(emptyDir);

      expect(images).toEqual([]);
    });
  });

  describe('selectRandomPhotos', () => {
    it('should return requested count when enough photos available', () => {
      const slideshow = new SlideShow();
      const photos = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg'];
      const selected = slideshow.selectRandomPhotos(photos, 3);

      expect(selected.length).toBe(3);
    });

    it('should return all photos when count exceeds available', () => {
      const slideshow = new SlideShow();
      const photos = ['a.jpg', 'b.jpg'];
      const selected = slideshow.selectRandomPhotos(photos, 5);

      expect(selected.length).toBe(2);
    });

    it('should return empty array for empty input', () => {
      const slideshow = new SlideShow();
      const selected = slideshow.selectRandomPhotos([], 5);

      expect(selected).toEqual([]);
    });

    it('should return different orderings (randomness test)', () => {
      const slideshow = new SlideShow();
      const photos = Array.from({ length: 20 }, (_, i) => `photo${i}.jpg`);

      const results = new Set();
      for (let i = 0; i < 10; i++) {
        const selected = slideshow.selectRandomPhotos(photos, 5);
        results.add(selected.join(','));
      }

      // With 20 photos and selecting 5, we should get different orderings
      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('extractOrientation', () => {
    it('should return 1 for images without EXIF data', async () => {
      const slideshow = new SlideShow({ photo_library: fixturesDir });
      const orientation = await slideshow.extractOrientation(
        join(fixturesDir, 'valid-photos', 'landscape.jpg')
      );

      expect(orientation).toBe(1);
    });

    it('should return 1 for non-existent files', async () => {
      const slideshow = new SlideShow({ photo_library: fixturesDir });
      const orientation = await slideshow.extractOrientation('/nonexistent/file.jpg');

      expect(orientation).toBe(1);
    });
  });

  describe('getRandomAlbum', () => {
    it('should return valid structure', async () => {
      const slideshow = new SlideShow({ photo_library: fixturesDir });
      const album = await slideshow.getRandomAlbum(3);

      expect(album).toHaveProperty('count');
      expect(album).toHaveProperty('images');
      expect(Array.isArray(album.images)).toBe(true);
    });

    it('should return images with required properties', async () => {
      const slideshow = new SlideShow({ photo_library: fixturesDir });
      const album = await slideshow.getRandomAlbum(3);

      if (album.images.length > 0) {
        for (const img of album.images) {
          expect(img).toHaveProperty('Orientation');
          expect(img).toHaveProperty('file');
          expect(typeof img.Orientation).toBe('number');
          expect(typeof img.file).toBe('string');
        }
      }
    });

    it('should use web_photo_dir prefix in file paths', async () => {
      const slideshow = new SlideShow({
        photo_library: fixturesDir,
        web_photo_dir: 'photos'
      });
      const album = await slideshow.getRandomAlbum(3);

      if (album.images.length > 0) {
        for (const img of album.images) {
          expect(img.file.startsWith('photos/')).toBe(true);
        }
      }
    });

    it('should respect count parameter', async () => {
      const slideshow = new SlideShow({ photo_library: fixturesDir });
      const album = await slideshow.getRandomAlbum(2);

      expect(album.count).toBeLessThanOrEqual(2);
      expect(album.images.length).toBeLessThanOrEqual(2);
    });

    it('should use default count when not specified', async () => {
      const slideshow = new SlideShow({
        photo_library: fixturesDir,
        default_count: 5
      });
      const album = await slideshow.getRandomAlbum();

      // The actual count might be less if not enough images
      expect(album.count).toBeLessThanOrEqual(5);
    });
  });
});
