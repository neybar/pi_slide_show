import { describe, it, expect } from 'vitest';
import { readdir, stat, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { SlideShow } from '../../lib/slideshow.mjs';
import { PANORAMA_ASPECT_THRESHOLD, TINY_ALBUM_MAX } from '../../www/js/config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const library = join(__dirname, '..', 'fixtures', 'perf-photos');
const scenariosDir = join(library, 'scenarios');
const SIZE_CAP_BYTES = 8 * 1024 * 1024;

// name -> { count, panorama (true/false), exif (orientations expected) }
const EXPECTED = {
  'full-panorama': { count: 36, panoramas: 2 },
  'full-no-panorama': { count: 36, panoramas: 0 },
  'partial-12': { count: 12, panoramas: 1 },
  'boundary-10': { count: 10, panoramas: 0 },
  'tiny-4-mixed': { count: 4, panoramas: 1, exif: [6, 8], thumbs: true },
  'tiny-6-portrait': { count: 6, panoramas: 0 },
  'single-landscape': { count: 1, panoramas: 0 },
  'single-portrait': { count: 1, panoramas: 0 },
  'single-panorama': { count: 1, panoramas: 1 },
  'single-exif6': { count: 1, panoramas: 0, exif: [6] },
};

async function photos(name) {
  const entries = await readdir(join(scenariosDir, name), { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith('.jpg')).map((e) => e.name).sort();
}

async function displayedAspect(file) {
  const m = await sharp(file).metadata();
  const rotated = m.orientation >= 5;
  return (rotated ? m.height : m.width) / (rotated ? m.width : m.height);
}

async function dirSize(dir) {
  let total = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    total += e.isDirectory() ? await dirSize(p) : (await stat(p)).size;
  }
  return total;
}

describe('committed album scenarios', () => {
  it('has exactly the expected scenario directories', async () => {
    const dirs = (await readdir(scenariosDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory()).map((e) => e.name).sort();
    expect(dirs).toEqual(Object.keys(EXPECTED).sort());
  });

  it('keeps tiny/single scenarios at or below TINY_ALBUM_MAX and grid ones above', () => {
    expect(EXPECTED['boundary-10'].count).toBe(TINY_ALBUM_MAX);
    expect(EXPECTED['partial-12'].count).toBeGreaterThan(TINY_ALBUM_MAX);
  });

  it('stays under the size cap', async () => {
    expect(await dirSize(scenariosDir)).toBeLessThan(SIZE_CAP_BYTES);
  });

  it('has a .noslideshow marker on scenarios/ itself', async () => {
    await expect(access(join(scenariosDir, '.noslideshow'))).resolves.toBeUndefined();
  });

  describe.each(Object.entries(EXPECTED))('%s', (name, exp) => {
    it('has the expected photo count, sortable names and a skip marker', async () => {
      const files = await photos(name);
      expect(files).toHaveLength(exp.count);
      expect(files[0]).toBe('p01.jpg');
      await expect(access(join(scenariosDir, name, '.noslideshow'))).resolves.toBeUndefined();
    });

    it('has no solid-colour image and the expected panoramas', async () => {
      let panoramas = 0;
      for (const f of await photos(name)) {
        const file = join(scenariosDir, name, f);
        const { channels } = await sharp(file).stats();
        for (const ch of channels.slice(0, 3)) expect(ch.stdev, `${name}/${f}`).toBeGreaterThan(10);
        if (await displayedAspect(file) > PANORAMA_ASPECT_THRESHOLD) panoramas++;
      }
      expect(panoramas).toBe(exp.panoramas);
    });

    it('has the expected EXIF orientations', async () => {
      const found = new Set();
      for (const f of await photos(name)) {
        const { orientation } = await sharp(join(scenariosDir, name, f)).metadata();
        found.add(orientation ?? 1);
      }
      for (const o of exp.exif ?? []) expect(found.has(o)).toBe(true);
      if (!exp.exif) expect([...found]).toEqual([1]);
    });

    it('has Synology M and XL thumbnails only where expected', async () => {
      for (const f of await photos(name)) {
        for (const size of ['M', 'XL']) {
          const thumb = join(scenariosDir, name, '@eaDir', f, `SYNOPHOTO_THUMB_${size}.jpg`);
          if (exp.thumbs) {
            const m = await sharp(thumb).metadata();
            expect(m.orientation ?? 1).toBe(1);
            expect(Math.max(m.width, m.height)).toBe(size === 'M' ? 320 : 1280);
          } else {
            await expect(access(thumb)).rejects.toThrow();
          }
        }
      }
    });
  });

  describe('discovery', () => {
    it('never walks into a scenario directory', async () => {
      const slideshow = new SlideShow({ photo_library: library });
      const dirs = await slideshow.collectDirectories(null, true);
      expect(dirs.filter((d) => d.includes('scenarios'))).toEqual([]);
    });

    it('random albums over perf-photos never contain a scenario photo', async () => {
      const slideshow = new SlideShow({ photo_library: library, default_count: 35 });
      for (let i = 0; i < 60; i++) {
        const album = await slideshow.getRandomAlbum();
        expect(album.count).toBeGreaterThan(TINY_ALBUM_MAX);
        for (const img of album.images) expect(img.file).not.toContain('scenarios');
      }
    });

    it('getAlbumFromDirectory still reads a scenario despite the marker', async () => {
      const slideshow = new SlideShow({ photo_library: library, default_count: 35 });
      const exif = await slideshow.getAlbumFromDirectory(join(scenariosDir, 'single-exif6'));
      expect(exif.count).toBe(1);
      expect(exif.images[0].Orientation).toBe(6);
      const full = await slideshow.getAlbumFromDirectory(join(scenariosDir, 'full-panorama'));
      expect(full.count).toBe(35);
    });
  });
});
