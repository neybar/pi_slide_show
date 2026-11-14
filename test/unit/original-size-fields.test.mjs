import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { SlideShow } from '../../lib/slideshow.mjs';
import { jpegDimensions, dimensionsFromHead } from '../../lib/image-header.mjs';

const scenarios = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/perf-photos/scenarios');

async function albumOf(dir) {
  const show = new SlideShow({ photo_library: dir });
  return show.getAlbumFromDirectory(dir, 50);
}

describe('album entries carry the original size (Bytes, Width, Height)', () => {
  let dir;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'orig-size-'));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  async function single(name, buildFile) {
    const sub = join(dir, name);
    const { mkdir } = await import('node:fs/promises');
    await mkdir(sub);
    await buildFile(join(sub, 'p.jpg'));
    const album = await albumOf(sub);
    expect(album.count).toBe(1);
    return { entry: album.images[0], path: join(sub, 'p.jpg') };
  }

  it('reports file size and dimensions for a plain JPEG', async () => {
    const { entry, path } = await single('plain', (f) =>
      sharp({ create: { width: 40, height: 20, channels: 3, background: '#888' } }).jpeg().toFile(f));
    expect(entry).toMatchObject({ Orientation: 1, Width: 40, Height: 20 });
    expect(entry.Bytes).toBe((await stat(path)).size);
  });

  it('reports displayed dimensions (swapped) for EXIF orientation 6', async () => {
    const { entry } = await single('rot6', (f) =>
      sharp({ create: { width: 40, height: 20, channels: 3, background: '#888' } })
        .withMetadata({ orientation: 6 }).jpeg().toFile(f));
    expect(entry).toMatchObject({ Orientation: 6, Width: 20, Height: 40 });
  });

  it('reads a huge-dimension JPEG from its header only (kept small with low quality)', async () => {
    const { entry, path } = await single('huge', (f) =>
      sharp({ create: { width: 12000, height: 9000, channels: 3, background: '#468' } })
        .jpeg({ quality: 1 }).toFile(f));
    expect(entry).toMatchObject({ Width: 12000, Height: 9000 });
    expect(entry.Bytes).toBe((await stat(path)).size);
    expect(entry.Width * entry.Height).toBeGreaterThan(24000000);
  });

  it('finds the SOF behind a segment larger than the 128 KiB head read', async () => {
    const { entry } = await single('bigexif', async (f) => {
      const jpg = await sharp({ create: { width: 64, height: 32, channels: 3, background: '#888' } })
        .jpeg().toBuffer();
      // Four 60000-byte APP2 segments (a segment holds at most 64 KiB): 240 KB before the SOF
      const pad = Buffer.alloc(60000);
      const seg = Buffer.concat([Buffer.from([0xff, 0xe2]), Buffer.from([(pad.length + 2) >> 8, (pad.length + 2) & 0xff]), pad]);
      await writeFile(f, Buffer.concat([jpg.subarray(0, 2), seg, seg, seg, seg, jpg.subarray(2)]));
    });
    expect(entry).toMatchObject({ Width: 64, Height: 32 });
  });

  it('reads PNG dimensions', async () => {
    const sub = join(dir, 'png');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(sub);
    await sharp({ create: { width: 30, height: 10, channels: 3, background: '#888' } }).png().toFile(join(sub, 'a.png'));
    const album = await albumOf(sub);
    expect(album.images[0]).toMatchObject({ Width: 30, Height: 10 });
  });

  it('omits the fields when the header is unreadable', async () => {
    const sub = join(dir, 'junk');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(sub);
    // Looks like a JPEG to file-type (magic bytes) but has no frame header
    await writeFile(join(sub, 'j.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9]));
    const album = await albumOf(sub);
    if (album.count === 1) {
      expect(Object.keys(album.images[0]).sort()).toEqual(['Orientation', 'file']);
    }
  });

  it('works on the single-* scenario fixtures', async () => {
    for (const name of ['single-landscape', 'single-portrait', 'single-panorama', 'single-exif6']) {
      const d = join(scenarios, name);
      const album = await albumOf(d);
      expect(album.count).toBe(1);
      const meta = await sharp(join(d, 'p01.jpg')).metadata();
      const swap = (meta.orientation || 1) >= 5;
      expect(album.images[0].Width).toBe(swap ? meta.height : meta.width);
      expect(album.images[0].Height).toBe(swap ? meta.width : meta.height);
      expect(album.images[0].Bytes).toBeGreaterThan(0);
    }
  });
});

describe('image-header', () => {
  it('rejects non-JPEG and truncated input', async () => {
    const none = async () => Buffer.alloc(0);
    expect(await jpegDimensions(Buffer.from('hello world'), none)).toBeNull();
    expect(await jpegDimensions(Buffer.from([0xff, 0xd8]), none)).toBeNull();
    expect(dimensionsFromHead(Buffer.alloc(8))).toBeNull();
  });
});
