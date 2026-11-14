import { describe, it, expect } from 'vitest';
import { readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { PANORAMA_ASPECT_THRESHOLD } from '../../www/js/config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const perfDir = join(__dirname, '..', 'fixtures', 'perf-photos');
const MAX_BYTES_PER_IMAGE = 20 * 1024;

async function perfPhotos(dir = perfDir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'scenarios') out.push(...await perfPhotos(p));
    } else if (e.name.endsWith('.jpg')) {
      out.push(p);
    }
  }
  return out.sort();
}

describe('perf-photos fixtures (generated abstract images)', () => {
  it('has photos in every album directory', async () => {
    const files = await perfPhotos();
    expect(files.length).toBeGreaterThanOrEqual(16 * 6);
  });

  it('has no solid or 1x1 image outside scenarios/', async () => {
    for (const file of await perfPhotos()) {
      const { channels } = await sharp(file).stats();
      for (const ch of channels.slice(0, 3)) {
        expect(ch.stdev, file).toBeGreaterThan(10);
      }
    }
  });

  it('keeps each image small', async () => {
    for (const file of await perfPhotos()) {
      expect((await stat(file)).size, file).toBeLessThanOrEqual(MAX_BYTES_PER_IMAGE);
    }
  });

  it('keeps album1/panorama.jpg panorama-shaped', async () => {
    const m = await sharp(join(perfDir, 'album1', 'panorama.jpg')).metadata();
    expect(m.width / m.height).toBeGreaterThan(PANORAMA_ASPECT_THRESHOLD);
    expect(m.width / m.height).toBeGreaterThan(2.0);
  });
});
